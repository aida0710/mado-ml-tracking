"""Job tokenで話すrunnerのプロトコル（POST /projects/:p/jobs/:j/runner/*）。

runnerはプロトコルのほかに、共通のArtifactTransferApiを通して同じtokenで入力をダウンロードし、
RunのArtifactを保存する。
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

import httpx

from ..api_paths import path_id
from ..artifact_uploads import UploadStateStore
from ..errors import ApiError, ConfigurationError, LeaseRejected
from ..http import request_async
from ..security import SecretMasker
from ..worker.artifact_transfer import ArtifactTransferApi
from ..worker.contracts import WorkerJob

# Jobが終わったかtokenが取り消された（401/410）、別のrunnerのJobになっている（409の
# runner_conflict、job_not_startable）、またはtokenがこのJobのものではない（403/404）。
RUNNER_REJECTED_STATUSES = {401, 403, 404, 409, 410}
# 出力の宣言は、宣言したモデルやデータセットについて403/404/409/422を返す。runner自身がJobを
# 失ったことを示すのはこれらだけ。
OUTPUT_REJECTED_STATUSES = {401, 410}
# APIでのRunnerFinish.errorの上限。長いメッセージで原因を説明しているのは末尾の部分。
MAX_FINISH_ERROR_CHARACTERS = 20000


class RunnerApi(ArtifactTransferApi):
    def __init__(
        self,
        *,
        url: str,
        token: str,
        job: WorkerJob,
        instance_id: str,
        masker: SecretMasker | None = None,
        transport: httpx.AsyncBaseTransport | None = None,
        upload_state_store: UploadStateStore | None = None,
    ):
        super().__init__(url=url, token=token, transport=transport, upload_state_store=upload_state_store)
        if masker is not None:
            # runnerのmaskerは、レジストリのパスワードとコードのシークレットも隠す。
            masker.add(token)
            self.masker = masker
        self.job = job
        self.instance_id = instance_id
        self.base_path = f"projects/{path_id(job.job['projectId'])}/jobs/{path_id(job.id)}/runner"

    async def _post(
        self,
        action: str,
        payload: dict[str, Any],
        *,
        retryable: bool,
        rejected_statuses: set[int] = RUNNER_REJECTED_STATUSES,
    ) -> dict[str, Any]:
        try:
            response = await request_async(
                self.http,
                "POST",
                f"{self.base_path}/{action}",
                json={"instanceId": self.instance_id, **payload},
                masker=self.masker,
                retryable=retryable,
            )
        except ApiError as error:
            if error.status_code in rejected_statuses:
                raise LeaseRejected(str(error), status_code=error.status_code, code=error.code) from None
            raise
        if response.status_code == 204:
            return {}
        body = response.json()
        if not isinstance(body, dict):
            raise ConfigurationError("Runner API returned a non-object response")
        return body

    async def start(self, *, host: str, gpu_ids: list[str], phase: str) -> dict[str, Any]:
        # APIは最初のinstanceIdを記録するので、同じstartを再送しても問題ない。
        state = await self._post("start", {"host": host, "gpuIds": gpu_ids, "phase": phase}, retryable=True)
        return _runner_state(state)

    async def heartbeat(self, *, phase: str, gpu_ids: list[str]) -> dict[str, Any]:
        # 届かなかったheartbeatは、5秒後の次のheartbeatが代わりになる。
        state = await self._post("heartbeat", {"phase": phase, "gpuIds": gpu_ids}, retryable=False)
        return _runner_state(state)

    async def logs(self, entries: list[dict[str, Any]]) -> None:
        await self._post("logs", {"entries": entries}, retryable=True)

    async def metrics(self, metrics: list[dict[str, Any]]) -> None:
        await self._post("metrics", {"metrics": metrics}, retryable=True)

    async def declare_outputs(self, declarations: list[dict[str, Any]]) -> list[dict[str, Any]]:
        """result.jsonのモデル・データセットを登録する。再送したindexには保存済みの登録を返す。"""
        response = await self._post(
            "outputs",
            {"version": 2, "declarations": declarations},
            retryable=True,
            rejected_statuses=OUTPUT_REJECTED_STATUSES,
        )
        items = response.get("items")
        if not isinstance(items, list) or not all(
            isinstance(item, dict) and type(item.get("index")) is int for item in items
        ):
            raise ConfigurationError("Output declaration response must contain indexed items")
        return items

    async def finish(
        self, *, status: str, exit_code: int | None, error: str | None, end_reason: str | None
    ) -> dict[str, Any]:
        payload: dict[str, Any] = {"status": status}
        if exit_code is not None:
            payload["exitCode"] = exit_code
        if error:
            masked = self.masker.mask(error)
            payload["error"] = masked[-MAX_FINISH_ERROR_CHARACTERS:]
        if end_reason is not None:
            payload["endReason"] = end_reason
        # 同じfinishを再送すると、最初のfinishが保存した内容が返る。
        return await self._post("finish", payload, retryable=True)


def _runner_state(state: dict[str, Any]) -> dict[str, Any]:
    if not isinstance(state.get("cancelRequested"), bool):
        raise ConfigurationError("Runner state must contain cancelRequested")
    return state


def upload_state_directory(workspace: Path) -> Path:
    # アップロードセッションはworkspaceから再開し、共有のホームディレクトリのキャッシュは使わない。
    return workspace / ".uploads"
