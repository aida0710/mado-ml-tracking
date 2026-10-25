"""画面がこのworkerに求める、接続の確認とディレクトリの一覧を取得して実行する。

これらはJobの監視と並んで動く。Jobのループは、取得するものが無い間に`poll`を呼ぶ。
"""

from __future__ import annotations

import asyncio
import logging
from typing import Any

from ..errors import ApiError, ConfigurationError
from .api import WorkerApi
from .config import WorkerSettings
from .directory_listing import list_directory
from .target_check_claims import DIRECTORY_LISTING, TARGET_CHECK_KINDS, ClaimedTargetCheck
from .target_probe import check_target

LOGGER = logging.getLogger(__name__)
# ディレクトリの一覧は、画面で人がパスを入力している間に求められるので、
# 2秒ほどごとにリクエストを取得する。それでも1秒ごとのJobの取得のループの半分の頻度。
TARGET_CHECK_POLL_SECONDS = 2.0
# 一覧を、数分かかることもある接続の確認の後ろで待たせない。
MAX_PARALLEL_TARGET_CHECKS = 2


class TargetCheckRunner:
    def __init__(self, settings: WorkerSettings, api: WorkerApi):
        self.settings = settings
        self.api = api
        self.running: dict[str, asyncio.Task[None]] = {}
        self.next_poll = 0.0

    async def poll(self) -> None:
        """空きがあり、ポーリングの間隔が過ぎていれば、リクエストを1つ取得する。"""
        self.collect_finished()
        if len(self.running) >= MAX_PARALLEL_TARGET_CHECKS:
            return
        now = asyncio.get_running_loop().time()
        if now < self.next_poll:
            return
        self.next_poll = now + TARGET_CHECK_POLL_SECONDS
        try:
            claimed = await self.api.claim_target_check(
                self.settings.worker_id,
                self.settings.target_ids,
                kinds=TARGET_CHECK_KINDS,
                active_check_ids=sorted(self.running),
            )
        except ApiError as error:
            LOGGER.warning("Target check claim failed: %s", str(error))
            return
        except ConfigurationError as error:
            LOGGER.error("Target check claim was rejected: %s", self.api.masker.mask(str(error)))
            return
        # ここでまだ動いている間にAPIが返したリクエストを、2回始めることは無い。
        if claimed is not None and claimed.check_id not in self.running:
            self.running[claimed.check_id] = asyncio.create_task(self.run(claimed))

    async def run(self, claimed: ClaimedTargetCheck) -> None:
        status, result = await self.perform(claimed)
        try:
            await self.api.complete_target_check(claimed, status=status, result=result)
        except ApiError as error:
            # APIは報告の無いリクエストを期限切れにするので、画面はもう一度求められる。
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
            health_url=self.settings.api.health_url,
            masker=self.api.masker,
        )
        return status, result

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
