"""Claim and run the connection checks and directory listings the Web asks of this worker.

They run beside Job monitoring: the Job loop calls `poll` while it has nothing to claim.
"""

from __future__ import annotations

import asyncio
import logging
from typing import Any

from ..errors import ApiError, ConfigurationError
from .api import UNKNOWN_FIELD_STATUS, WorkerApi
from .config import WorkerSettings
from .directory_listing import list_directory
from .target_check_claims import DIRECTORY_LISTING, TARGET_CHECK_KINDS, ClaimedTargetCheck
from .target_check_report import as_result_version
from .target_probe import check_target

LOGGER = logging.getLogger(__name__)
# A directory listing is asked while a person types a path in the Web, so requests are claimed
# every couple of seconds; still half the rate of the one-second Job claim loop.
TARGET_CHECK_POLL_SECONDS = 2.0
# A listing must not wait behind a connection check, which may take minutes.
MAX_PARALLEL_TARGET_CHECKS = 2
# APIs from before directory listings hand out a claimed check again until it completes, so only
# one runs at a time.
MAX_PARALLEL_TARGET_CHECKS_BEFORE_LISTINGS = 1
NOT_FOUND_STATUS = 404


class TargetCheckRunner:
    def __init__(self, settings: WorkerSettings, api: WorkerApi):
        self.settings = settings
        self.api = api
        self.enabled = True
        # None once the API turned out to predate directory listings: it is then asked in its own
        # form, for connection checks of MMT_WORKER_TARGET_IDS.
        self.kinds: tuple[str, ...] | None = TARGET_CHECK_KINDS
        self.running: dict[str, asyncio.Task[None]] = {}
        self.next_poll = 0.0

    def max_parallel(self) -> int:
        if self.kinds is None:
            return MAX_PARALLEL_TARGET_CHECKS_BEFORE_LISTINGS
        return MAX_PARALLEL_TARGET_CHECKS

    async def poll(self) -> None:
        """Claim one request when a slot is free and the poll interval has passed."""
        self.collect_finished()
        if not self.enabled or len(self.running) >= self.max_parallel():
            return
        now = asyncio.get_running_loop().time()
        if now < self.next_poll:
            return
        self.next_poll = now + TARGET_CHECK_POLL_SECONDS
        try:
            claimed = await self.api.claim_target_check(
                self.settings.worker_id,
                self.settings.target_ids,
                kinds=self.kinds,
                active_check_ids=sorted(self.running),
            )
        except ApiError as error:
            self.handle_claim_error(error)
            return
        except ConfigurationError as error:
            LOGGER.error("Target check claim was rejected: %s", self.api.masker.mask(str(error)))
            return
        # A claim the API hands back while it still runs here is never started twice.
        if claimed is not None and claimed.check_id not in self.running:
            self.running[claimed.check_id] = asyncio.create_task(self.run(claimed))

    def handle_claim_error(self, error: ApiError) -> None:
        if error.status_code == NOT_FOUND_STATUS:
            self.enabled = False
            LOGGER.warning("The API has no target check endpoint; connection checks are disabled")
        elif error.status_code == UNKNOWN_FIELD_STATUS and self.kinds is not None:
            self.use_claim_form_before_listings()
        else:
            LOGGER.warning("Target check claim failed: %s", str(error))

    def use_claim_form_before_listings(self) -> None:
        """The API refused `kinds`: it hands out only connection checks of the worker's targets."""
        self.kinds = None
        # The 422 claimed nothing; the next poll asks again in the API's form.
        self.next_poll = 0.0
        if self.settings.target_ids:
            LOGGER.warning(
                "The API predates directory listings; claiming connection checks of "
                "MMT_WORKER_TARGET_IDS only"
            )
            return
        self.enabled = False
        LOGGER.warning(
            "The API predates checks assigned to a worker and MMT_WORKER_TARGET_IDS is empty; "
            "target checks are disabled"
        )

    async def run(self, claimed: ClaimedTargetCheck) -> None:
        status, result = await self.perform(claimed)
        try:
            await self.api.complete_target_check(claimed, status=status, result=result)
        except ApiError as error:
            # The API expires an unreported request, so the Web can ask again.
            LOGGER.error("Target check %s report failed: %s", claimed.check_id, str(error))

    async def perform(self, claimed: ClaimedTargetCheck) -> tuple[str, dict[str, Any]]:
        if claimed.kind == DIRECTORY_LISTING and claimed.directory_path is not None:
            return await list_directory(
                claimed.target,
                claimed.directory_path,
                allow_local_executor=self.settings.allow_local_executor,
                masker=self.api.masker,
            )
        status, result = await check_target(
            claimed.target,
            allow_local_executor=self.settings.allow_local_executor,
            health_url=f"{self.settings.api.url}/health",
            masker=self.api.masker,
        )
        return status, as_result_version(result, claimed.result_version)

    def collect_finished(self) -> None:
        for check_id, task in list(self.running.items()):
            if not task.done():
                continue
            del self.running[check_id]
            if not task.cancelled() and task.exception() is not None:
                LOGGER.error(
                    "Target check %s stopped without a report: %s",
                    check_id,
                    self.api.masker.mask(str(task.exception())),
                )

    async def stop(self) -> None:
        for task in self.running.values():
            task.cancel()
        await asyncio.gather(*self.running.values(), return_exceptions=True)
        self.running.clear()
