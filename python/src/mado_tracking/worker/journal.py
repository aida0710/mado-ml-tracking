"""workerの非公開のスナップショットと、送信を確認したログのカーソルは、workerを再起動しても残る。"""

from __future__ import annotations

import fcntl
import json
import logging
import os
import re
from dataclasses import replace
from pathlib import Path
from typing import Any, TextIO

from ..errors import ConfigurationError
from .contracts import WorkerJob
from .host_state import read_json, write_json

LOGGER = logging.getLogger(__name__)
# 入力データセットのステージング（dataset_staging.py）: このインデックスの入力についての、
# リクエスト、中継したアーカイブ、またはダウンロードした1つのファイル。
DATASET_TRANSFER_KIND = re.compile(r"^dataset-(?:request|archive|file)-\d+$")
# 1つのJobの一時ファイル: 中継する前の入力と、保存する前の出力。
TRANSFER_KINDS = {"source", "weights", "sif", "output", "snapshot", "checkpoint", "input-checkpoint"}


def snapshot_payload(job: WorkerJob) -> dict[str, Any]:
    return {
        "job": job.job,
        "run": job.run,
        "target": job.target,
        "codeVersion": job.code_version,
        "modelVersion": job.model_version,
        "inputDatasets": job.input_datasets,
        # stateディレクトリは非公開（0700/0600）。tokenはほかのどこにも保存しない。
        "jobToken": job.job_token,
        "inputCheckpoint": job.input_checkpoint,
        "triggerPayload": job.trigger_payload,
    }


def with_saved_job_token(job: WorkerJob, record: dict[str, Any]) -> WorkerJob:
    """APIがtokenを返さないとき（再開）は、起動済みのプロセスが既に持っているtokenを使い続ける。"""
    snapshot = record.get("snapshot")
    if job.job_token is not None or not isinstance(snapshot, dict):
        return job
    saved_token = snapshot.get("jobToken")
    if not isinstance(saved_token, str) or snapshot.get("job", {}).get("leaseId") != job.lease_id:
        return job
    return replace(job, job_token=saved_token)


class JobJournal:
    def __init__(self, directory: Path):
        self.directory = directory
        directory.mkdir(parents=True, exist_ok=True, mode=0o700)
        if directory.is_symlink():
            raise ConfigurationError("Worker state directory must not be a symlink")
        directory.chmod(0o700)
        self.lock: TextIO | None = None

    def acquire_worker_lock(self) -> None:
        self.lock = (self.directory / "worker.lock").open("a")
        try:
            fcntl.flock(self.lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            self.lock.close()
            self.lock = None
            raise ConfigurationError("Another worker already owns this state directory") from None

    def close(self) -> None:
        if self.lock is not None:
            self.lock.close()
            self.lock = None

    def save(
        self,
        job: WorkerJob,
        *,
        offsets: dict[str, int] | None = None,
        step: int = 0,
        completion: dict[str, Any] | None = None,
        results: dict[str, Any] | None = None,
    ) -> None:
        write_json(
            self.directory / f"{job.id}.json",
            {
                "snapshot": snapshot_payload(job),
                "offsets": offsets or {"stdout": 0, "stderr": 0},
                "step": step,
                "completion": completion,
                "results": results or {},
            },
        )

    def load(self, job_id: str) -> dict[str, Any]:
        path = self.directory / f"{job_id}.json"
        return read_json(path) if path.exists() else {"offsets": {"stdout": 0, "stderr": 0}, "step": 0}

    def pending(self) -> list[WorkerJob]:
        jobs = []
        for path in self.directory.glob("*.json"):
            try:
                jobs.append(WorkerJob.parse(read_json(path)["snapshot"]))
            except ConfigurationError as error:
                LOGGER.error(
                    "Saved Job %s failed validation; journal and lease retained: %s", path.stem, error
                )
            except (json.JSONDecodeError, KeyError, TypeError):
                LOGGER.error("Saved Job %s has an incomplete journal; journal and lease retained", path.stem)
        return jobs

    def has_job(self, job_id: str) -> bool:
        path = self.directory / f"{job_id}.json"
        return path.exists() or path.is_symlink()

    def forget(self, job_id: str) -> None:
        (self.directory / f"{job_id}.json").unlink(missing_ok=True)

    def record_rejection(self, job: WorkerJob) -> None:
        write_json(
            self.directory / f"{job.id}.rejected",
            {"jobId": job.id, "reason": "Lease rejected; no new execution was started"},
        )
        self.forget(job.id)

    def archive_path(self, job_id: str) -> Path:
        return self.transfer_path(job_id, "source")

    def transfer_path(self, job_id: str, kind: str) -> Path:
        if kind not in TRANSFER_KINDS and not DATASET_TRANSFER_KIND.fullmatch(kind):
            raise ValueError("Unknown transfer kind")
        path = self.directory / f"{job_id}.{kind}"
        descriptor = os.open(path, os.O_CREAT | os.O_WRONLY | os.O_TRUNC, 0o600)
        os.close(descriptor)
        return path
