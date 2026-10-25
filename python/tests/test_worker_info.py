"""claimとresumeでworkerがworkerInfoに載せて報告するものと、その項目を拒否する古いAPI。"""

from __future__ import annotations

import asyncio
import json
from collections.abc import Collection, Sequence
from pathlib import Path
from typing import Any

import httpx
import pytest

from mado_tracking.errors import ApiError
from mado_tracking.worker.api import WorkerApi

API_TOKEN = "test-api-secret"
# APIは、厳密なスキーマが知らない項目を、項目名を示さずに拒否する
# （apps/api/src/http/request.tsは、その項目を持つオブジェクトのパスしか返さない）。
UNKNOWN_FIELD_REFUSAL = {"error": "入力が不正です: workerInfo", "code": "invalid_request"}


class PresenceServer:
    """claimとresumeに応答する。古いAPIは、知らない項目を含むworkerInfoを拒否する。"""

    def __init__(self, *, unknown_fields: Collection[str] = ()):
        self.unknown_fields = frozenset(unknown_fields)
        self.requests: list[tuple[str, dict[str, Any]]] = []

    def serve(self, request: httpx.Request) -> httpx.Response:
        body = json.loads(request.content)
        endpoint = request.url.path.rsplit("/", 1)[-1]
        self.requests.append((endpoint, body))
        if self.unknown_fields & set(body.get("workerInfo", {})):
            return httpx.Response(422, json=UNKNOWN_FIELD_REFUSAL)
        return httpx.Response(200, json={"item": None} if endpoint == "claim" else {"items": []})



def run_presence(server: PresenceServer, *, ssh_directories: Sequence[Path] = ()) -> None:
    """起動するworker: 持っていたものをresumeし、そのあと1回claimする。"""

    async def scenario() -> None:
        api = WorkerApi(
            url="http://localhost/api",
            token=API_TOKEN,
            transport=httpx.MockTransport(server.serve),
            ssh_directories=ssh_directories,
        )
        try:
            await api.resume("presence-worker", [])
            assert await api.claim("presence-worker", []) is None
        finally:
            await api.close()

    asyncio.run(scenario())


def test_接続要求には必須のworker情報がすべて含まれる():
    server = PresenceServer()
    run_presence(server)
    for _, body in server.requests:
        assert set(body["workerInfo"]) == {"version", "hostname", "parallelJobs", "sshFiles", "capabilities"}
        assert body["workerInfo"]["capabilities"] == ["workflowDatasetUsage"]


@pytest.mark.parametrize("fields", [{"capabilities"}, {"sshFiles"}, {"capabilities", "sshFiles"}])
def test_必須項目を拒否するAPIには項目を減らして再送しない(fields):
    server = PresenceServer(unknown_fields=fields)
    with pytest.raises(ApiError) as raised:
        run_presence(server)
    assert raised.value.status_code == 422
    assert len(server.requests) == 1
    assert fields <= set(server.requests[0][1]["workerInfo"])
