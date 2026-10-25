"""workerとsiteのrunnerで共有する、Artifactのダウンロードと、RunのArtifactのアップロード。

どちらも1つのbearer token（worker token、siteではJob token）で認証し、SDKの再開できる転送を使う。
ダウンロードはRange、大きなファイルのアップロードはアップロードセッションで再開する。
"""

from __future__ import annotations

from collections.abc import AsyncIterator
from pathlib import Path
from typing import Any, BinaryIO

import httpx

from ..artifact_downloads import download_resumable_async
from ..artifact_uploads import (
    SESSION_UPLOAD_THRESHOLD_BYTES,
    UploadStateStore,
    UploadTarget,
    upload_file_async,
)
from ..errors import ApiError, ConfigurationError
from ..http import REQUEST_TIMEOUT_SECONDS, request_async
from ..security import SecretMasker
from .contracts import WorkerJob
from .download_content import write_downloaded_content

# Artifactのアップロードは、SDKと同じ1MiBまでのメモリの枠を使う。
ARTIFACT_CHUNK_BYTES = 1024 * 1024
# コンテナの出力は、RunのArtifactのこの前置きの下に保存する（`container/<path>`）。
CONTAINER_OUTPUT_PREFIX = "container/"


class ArtifactTransferApi:
    def __init__(
        self,
        *,
        url: str,
        token: str,
        transport: httpx.AsyncBaseTransport | None = None,
        upload_state_store: UploadStateStore | None = None,
    ):
        self.masker = SecretMasker([token])
        self.upload_state_store = upload_state_store
        self.http = httpx.AsyncClient(
            base_url=url.rstrip("/") + "/",
            transport=transport,
            headers={"Authorization": f"Bearer {token}"},
            timeout=REQUEST_TIMEOUT_SECONDS,
            follow_redirects=False,
        )

    async def close(self) -> None:
        await self.http.aclose()

    async def download_artifact(
        self, project_id: str, artifact_id: str, destination: BinaryIO, *, maximum_bytes: int | None = None
    ) -> dict[str, Any]:
        """中断したダウンロードをRangeで再開する。destinationはseekできるものに限る。"""

        async def write_encoded(response: httpx.Response) -> dict[str, Any]:
            try:
                return await write_downloaded_content(
                    response, destination, label="Artifact", maximum_bytes=maximum_bytes
                )
            except (httpx.TransportError, httpx.DecodingError, httpx.StreamError):
                # エンコードされた本文には、再開に使えるバイト位置が無い。
                raise ApiError("Artifact download interrupted or invalid; retry from the beginning") from None

        return await download_resumable_async(
            self.http,
            f"projects/{project_id}/artifacts/{artifact_id}/content",
            destination,
            masker=self.masker,
            maximum_bytes=maximum_bytes,
            # 上限のあるコードのアーカイブはidentityだけで受け取る。エンコードは
            # write_downloaded_contentが拒む。
            encoded_fallback=write_encoded,
        )

    async def upload_output_artifact(self, job: WorkerJob, artifact: dict[str, Any], source: Path) -> None:
        path = f"{CONTAINER_OUTPUT_PREFIX}{artifact['path']}"
        await self.upload_run_artifact(job, artifact, source, path=path)

    async def upload_snapshot_artifact(self, job: WorkerJob, artifact: dict[str, Any], source: Path) -> None:
        """ソースのスナップショットのファイルを、予約済みの`.mmt/`のArtifactのパスに保存する。"""
        from .source_snapshot import SNAPSHOT_FILENAMES

        if artifact.get("path") not in SNAPSHOT_FILENAMES:
            raise ConfigurationError("Source snapshot requires a reserved Artifact path")
        await self.upload_run_artifact(job, artifact, source, path=artifact["path"])

    async def upload_run_artifact(
        self, job: WorkerJob, artifact: dict[str, Any], source: Path, *, path: str
    ) -> None:
        project_id, run_id = job.job["projectId"], job.run["id"]
        if artifact["size"] >= SESSION_UPLOAD_THRESHOLD_BYTES:
            saved = await upload_file_async(
                self.http,
                masker=self.masker,
                target=UploadTarget(
                    api_url=str(self.http.base_url),
                    project_id=project_id,
                    run_id=run_id,
                    path=path,
                    mime_type=artifact["mimeType"],
                ),
                source=source,
                state_store=self.upload_state_store,
            )
        else:
            saved = await self.put_run_artifact(
                project_id=project_id, run_id=run_id, artifact=artifact, source=source, path=path
            )
        if (saved.get("sha256"), saved.get("size")) != (artifact["sha256"], artifact["size"]):
            raise ConfigurationError("Saved Run Artifact checksum or size does not match")

    async def put_run_artifact(
        self, *, project_id: str, run_id: str, artifact: dict[str, Any], source: Path, path: str
    ) -> dict[str, Any]:
        """1回のPUTで送る。失敗時はファイル全体を再送するので、小さいArtifactだけがここを通る。"""

        async def chunks() -> AsyncIterator[bytes]:
            with source.open("rb") as content:
                while chunk := content.read(ARTIFACT_CHUNK_BYTES):
                    yield chunk

        response = await request_async(
            self.http,
            "PUT",
            f"projects/{project_id}/runs/{run_id}/artifacts",
            params={"path": path},
            headers={"Content-Type": artifact["mimeType"]},
            content=chunks(),
            masker=self.masker,
        )
        saved = response.json()
        if not isinstance(saved, dict):
            raise ConfigurationError("Saved Run Artifact response must be an object")
        return saved
