"""workerの識別、Jobの取得・復旧のキュー、プロセスの寿命にわたる調整。"""

from __future__ import annotations

import asyncio
import logging
from collections.abc import Callable

from ..errors import ApiError, ConfigurationError, LeaseRejected
from .api import WorkerApi
from .config import WorkerSettings
from .contracts import WorkerJob
from .event_wait import wait_interval
from .job_responses import InvalidWorkerJob
from .journal import JobJournal, with_saved_job_token
from .runtime import JobExecutor
from .session import JobSession
from .target_check_runner import TargetCheckRunner

LOGGER = logging.getLogger(__name__)


class Worker:
    def __init__(
        self,
        settings: WorkerSettings,
        *,
        api: WorkerApi | None = None,
        executor_factory: Callable[[WorkerJob, WorkerSettings], JobExecutor] = JobExecutor,
    ):
        self.settings = settings
        self.api = api or WorkerApi(
            parallel_jobs=settings.parallel_jobs,
            url=settings.api.url,
            token=settings.api.token,
            ssh_directories=settings.ssh_directories,
        )
        self.journal = JobJournal(settings.state_directory)
        self.executor_factory = executor_factory
        self.stopping = asyncio.Event()
        self.tasks: dict[str, asyncio.Task[None]] = {}
        self.retained_job_ids: set[str] = set()
        # タスクが既に動いているJobのために、APIが発行し直したtoken（取得に失敗したあとの再開）。
        self.reissued_job_tokens: dict[str, str] = {}
        self.resume_available = True
        self.target_checks = TargetCheckRunner(settings, self.api)

    async def run_job(self, job: WorkerJob) -> None:
        if job.job.get("workerId") != self.settings.worker_id:
            raise ConfigurationError("Job belongs to a different worker")
        if self.settings.target_ids and job.target["id"] not in self.settings.target_ids:
            raise ConfigurationError("Job target is outside this worker's configured targets")
        record = self.journal.load(job.id)
        job = with_saved_job_token(job, record)
        if "snapshot" in record and record["snapshot"]["job"]["leaseId"] != job.lease_id:
            raise ConfigurationError("Saved job lease differs; refusing a replacement execution")
        if "snapshot" in record:
            previous = WorkerJob.parse(record["snapshot"])
            if previous.run["id"] != job.run["id"] or previous.execution_snapshot != job.execution_snapshot:
                raise ConfigurationError(
                    "Saved executionSnapshot differs; refusing changed execution instructions"
                )
        self.journal.save(
            job,
            offsets=record["offsets"],
            step=record.get("step", 0),
            completion=record.get("completion"),
            results=record.get("results"),
        )
        try:
            executor = self.executor_factory(job, self.settings)
            session = JobSession(
                job,
                api=self.api,
                settings=self.settings,
                journal=self.journal,
                executor=executor,
                reissued_job_token=lambda: self.reissued_job_tokens.get(job.id),
            )
            await session.execute()
        except LeaseRejected:
            self.journal.record_rejection(job)
            LOGGER.error("Job %s lease rejected; no new execution was started", job.id)
        finally:
            self.reissued_job_tokens.pop(job.id, None)

    async def recover(self) -> list[WorkerJob]:
        pending = {job.id: job for job in self.journal.pending()}
        try:
            resumed = await self.api.resume(self.settings.worker_id, self.settings.target_ids)
            self.resume_available = True
            for job in resumed:
                if isinstance(job, InvalidWorkerJob):
                    await self.reject_invalid_job(job, resumed=True)
                else:
                    pending[job.id] = job
        except ApiError as error:
            if error.status_code != 404:
                raise
            self.resume_available = False
            LOGGER.warning("Worker resume endpoint is unavailable; recovering only saved local leases")
        return list(pending.values())

    async def reject_invalid_job(self, job: InvalidWorkerJob, *, resumed: bool = False) -> None:
        if (
            resumed
            or job.status != "claimed"
            or job.id in self.tasks
            or job.id in self.retained_job_ids
            or self.journal.has_job(job.id)
        ):
            # 応答では、以前に始めた実行が止まったことを証明できない。保存済みの監視は続ける。
            LOGGER.error(
                "Job %s instructions failed validation; lease retained for monitoring/recovery: %s",
                job.id,
                self.api.masker.mask(job.error),
            )
            # 残しているleaseは、その実行が止まったとは報告せずに、取得のやり直しの対象から外す。
            self.retained_job_ids.add(job.id)
            return
        try:
            await self.api.complete(job, status="failed", error=f"WorkerJob validation failed: {job.error}")
            LOGGER.error("Unstarted claimed Job %s failed validation and was completed as failed", job.id)
        except LeaseRejected:
            LOGGER.error("Invalid claimed Job %s lease rejected; no execution started", job.id)

    def launch(self, job: WorkerJob) -> None:
        if job.id not in self.tasks:
            self.tasks[job.id] = asyncio.create_task(self.run_job(job))
        elif job.job_token is not None:
            # 発行し直したことで、タスクが持つtokenは無効になった。
            # タスクはコードを起動する前にこのtokenに切り替える。
            self.reissued_job_tokens[job.id] = job.job_token

    def collect_finished(self) -> None:
        for job_id, task in list(self.tasks.items()):
            if not task.done():
                continue
            del self.tasks[job_id]
            if not task.cancelled() and task.exception() is not None:
                if isinstance(task.exception(), ConfigurationError):
                    self.retained_job_ids.add(job_id)
                LOGGER.error(
                    "Job %s monitoring stopped; durable state remains for recovery: %s",
                    job_id,
                    self.api.masker.mask(str(task.exception())),
                )

    async def run_forever(self) -> None:
        self.journal.acquire_worker_lock()
        try:
            for job in await self.recover():
                self.launch(job)
            while not self.stopping.is_set():
                self.collect_finished()
                if len(self.tasks) < self.settings.parallel_jobs:
                    try:
                        claimed_job = await self.api.claim(
                            self.settings.worker_id,
                            self.settings.target_ids,
                            active_job_ids=(*self.tasks, *sorted(self.retained_job_ids - self.tasks.keys())),
                        )
                        if isinstance(claimed_job, InvalidWorkerJob):
                            await self.reject_invalid_job(claimed_job)
                        elif claimed_job is not None and claimed_job.id not in self.tasks:
                            self.launch(claimed_job)
                            continue
                    except ApiError as error:
                        LOGGER.warning("Claim failed; recovering possible existing claim: %s", str(error))
                        if not self.resume_available:
                            raise ConfigurationError(
                                "Lost claim response requires /worker/resume before claiming again"
                            ) from None
                        for job in await self.recover():
                            self.launch(job)
                await self.target_checks.poll()
                await wait_interval(self.stopping, self.settings.poll_seconds)
        finally:
            await self.target_checks.stop()
            # workerが終了しても、切り離された実行は動き続け、そのjournalも残る。
            for task in self.tasks.values():
                task.cancel()
            await asyncio.gather(*self.tasks.values(), return_exceptions=True)
            self.journal.close()
            await self.api.close()
