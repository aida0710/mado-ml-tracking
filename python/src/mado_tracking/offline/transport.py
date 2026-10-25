"""Runの書き込みの行き先。API（online）、ローカルのspool（offline）、またはAPIにつながらなく
なるまでonline（auto）。RunはRunTransportとだけやり取りするので、自分ではモードで分岐しない。
"""

from __future__ import annotations

import socket
import sys
import threading
from collections.abc import Callable, Iterator, Mapping
from dataclasses import dataclass, field
from pathlib import Path
from typing import TYPE_CHECKING, Any, BinaryIO, Literal, Protocol, TypeVar

from ..api_paths import path_id
from ..artifact_uploads import (
    SESSION_UPLOAD_THRESHOLD_BYTES,
    UploadSessionFailed,
    UploadTarget,
    upload_file_sync,
)
from ..errors import ApiError, ConfigurationError
from ..timestamps import utc_timestamp
from .spool import RunSpool, SpoolRunRecord

if TYPE_CHECKING:
    from ..client import Client

RunMode = Literal["online", "offline", "auto"]
RUN_MODES: tuple[RunMode, ...] = ("online", "offline", "auto")
# 数GBのモデルのArtifactでも、アップロードに使うメモリを一定に抑える。
ARTIFACT_CHUNK_BYTES = 1024 * 1024
# Run.syncOriginは200文字まで（SYNC_ORIGIN_MAX_LENGTH）。
SYNC_ORIGIN_MAX_LENGTH = 200

Result = TypeVar("Result")


@dataclass(frozen=True)
class RunMediaItem:
    """ファイルをartifact_pathに保存したあとで登録するメディア。idはSDKが決めるので、登録を
    送り直しても（オンラインでもspoolからでも）2つ目の項目は増えない。"""

    id: str
    key: str
    step: int
    kind: str
    artifact_path: str
    mime_type: str
    caption: str | None = None
    metadata: dict[str, Any] = field(default_factory=dict)


class RunTransport(Protocol):
    """Runの書き込み側。Runを変えるメソッドは、分かれば新しいエンティティを返す。"""

    @property
    def offline_directory(self) -> Path | None:
        """レコードの書き先がspoolになったらそのディレクトリ、そうでなければNone。"""

    def start(self) -> dict[str, Any] | None: ...

    def finish(self, status: str) -> dict[str, Any] | None: ...

    def log_metrics(self, points: list[dict[str, Any]]) -> None: ...

    def log_params(self, parameters: Mapping[str, Any]) -> dict[str, Any] | None: ...

    def set_tags(self, tags: Mapping[str, str]) -> dict[str, Any] | None: ...

    def log_entries(self, entries: list[dict[str, Any]]) -> None: ...

    def log_artifact(
        self, source: Path | BinaryIO, *, path: str, mime_type: str, copy: bool
    ) -> dict[str, Any]: ...

    def log_media(self, source: Path, media: RunMediaItem) -> dict[str, Any]:
        """sourceをArtifactのmedia.artifact_pathとして保存し、Runのメディアとして登録する。"""

    def close(self) -> None: ...


def resolve_mode(mode: str | None, environment: Mapping[str, str]) -> RunMode:
    """明示されたモード、無ければMMT_MODE、それも無ければonline（W&BのWANDB_MODEと同じ役割）。"""
    chosen = mode or environment.get("MMT_MODE") or "online"
    for known in RUN_MODES:
        if chosen == known:
            return known
    raise ConfigurationError(f"mode must be one of {', '.join(RUN_MODES)}, not {chosen!r}")


def machine_origin() -> str:
    return socket.gethostname()[:SYNC_ORIGIN_MAX_LENGTH]


def spool_record_from_entity(entity: Mapping[str, Any], *, project_id: str, api_url: str) -> SpoolRunRecord:
    """APIが作成済みのRunのrun.json。syncのPUTがそのRunを見つけ、何も変えずに済むようにする。"""
    return SpoolRunRecord(
        run_id=str(entity["id"]),
        project_id=project_id,
        api_url=api_url,
        experiment_id=str(entity["experimentId"]),
        name=str(entity.get("name") or entity["id"]),
        kind=str(entity.get("kind") or "training"),
        parameters=dict(entity.get("parameters") or {}),
        tags=dict(entity.get("tags") or {}),
        parent_run_id=entity.get("parentRunId"),
        started_at=str(entity.get("startedAt") or utc_timestamp()),
        origin=machine_origin(),
    )


def is_api_unreachable(error: ApiError) -> bool:
    """接続が切れたか、再試行しても5xxのまま。4xxは本当の応答なので、例外として投げる。"""
    if isinstance(error, UploadSessionFailed):
        return False
    return error.status_code is None or error.status_code >= 500


class HttpRunTransport:
    """すべての書き込みを、すぐにネイティブAPIへ送る。"""

    def __init__(self, client: Client, project_id: str, run_id: str):
        self.client = client
        self.project_id = project_id
        self.run_id = run_id
        self.run_path = client.project_path(project_id, f"runs/{path_id(run_id)}")

    @property
    def offline_directory(self) -> Path | None:
        return None

    def start(self) -> dict[str, Any] | None:
        return self.client.request("PATCH", self.run_path, json={"status": "running"}, retryable=True)

    def finish(self, status: str) -> dict[str, Any] | None:
        return self.client.request("PATCH", self.run_path, json={"status": status}, retryable=True)

    def log_metrics(self, points: list[dict[str, Any]]) -> None:
        self.client.request("POST", f"{self.run_path}/metrics", json={"metrics": points}, retryable=True)

    def log_params(self, parameters: Mapping[str, Any]) -> dict[str, Any] | None:
        return self.client.request(
            "PATCH", self.run_path, json={"parameters": dict(parameters)}, retryable=True
        )

    def set_tags(self, tags: Mapping[str, str]) -> dict[str, Any] | None:
        return self.client.request("PATCH", self.run_path, json={"tags": dict(tags)}, retryable=True)

    def log_entries(self, entries: list[dict[str, Any]]) -> None:
        self.client.request("POST", f"{self.run_path}/logs", json={"entries": entries}, retryable=True)

    def log_artifact(
        self, source: Path | BinaryIO, *, path: str, mime_type: str, copy: bool
    ) -> dict[str, Any]:
        """SESSION_UPLOAD_THRESHOLD_BYTES以上のファイルは、再開できるアップロードセッションを
        使う。"""
        if isinstance(source, Path) and source.stat().st_size >= SESSION_UPLOAD_THRESHOLD_BYTES:
            return upload_file_sync(
                self.client,
                target=UploadTarget(
                    api_url=self.client.settings.url,
                    project_id=self.project_id,
                    run_id=self.run_id,
                    path=path,
                    mime_type=mime_type,
                ),
                source=source,
            )
        stream = source.open("rb") if isinstance(source, Path) else source

        def chunks() -> Iterator[bytes]:
            while chunk := stream.read(ARTIFACT_CHUNK_BYTES):
                yield chunk

        try:
            return self.client.request(
                "PUT",
                f"{self.run_path}/artifacts",
                params={"path": path},
                headers={"Content-Type": mime_type},
                content_factory=chunks,
            )
        finally:
            if isinstance(source, Path):
                stream.close()

    def log_media(self, source: Path, media: RunMediaItem) -> dict[str, Any]:
        artifact = self.log_artifact(source, path=media.artifact_path, mime_type=media.mime_type, copy=True)
        item = {
            "id": media.id,
            "key": media.key,
            "step": media.step,
            "kind": media.kind,
            "artifactId": artifact["id"],
            "caption": media.caption,
            "metadata": media.metadata,
        }
        # メディアのidでPOSTが冪等になるので、応答が失われても再試行できる。
        created = self.client.request(
            "POST", f"{self.run_path}/media", json={"items": [item]}, retryable=True
        )
        return dict(created["items"][0])

    def close(self) -> None:
        pass


class SpoolRunTransport:
    """すべての書き込みをローカルのspoolに書き足す。APIには何も接続しない。"""

    def __init__(self, spool: RunSpool):
        self.spool = spool

    @property
    def offline_directory(self) -> Path | None:
        return self.spool.directory

    def start(self) -> dict[str, Any] | None:
        # spoolに書いたRunは、PUT /sync/runs/:runIdが実行中の状態で作る。
        return None

    def finish(self, status: str) -> dict[str, Any] | None:
        self.spool.write_status(status, ended_at=utc_timestamp())
        return None

    def log_metrics(self, points: list[dict[str, Any]]) -> None:
        self.spool.append_metrics(points)

    def log_params(self, parameters: Mapping[str, Any]) -> dict[str, Any] | None:
        self.spool.append_params(parameters)
        return None

    def set_tags(self, tags: Mapping[str, str]) -> dict[str, Any] | None:
        self.spool.append_tags(tags)
        return None

    def log_entries(self, entries: list[dict[str, Any]]) -> None:
        self.spool.append_logs(entries)

    def log_artifact(
        self, source: Path | BinaryIO, *, path: str, mime_type: str, copy: bool
    ) -> dict[str, Any]:
        return self.spool.add_artifact(source, path=path, mime_type=mime_type, copy=copy)

    def log_media(self, source: Path, media: RunMediaItem) -> dict[str, Any]:
        self.spool.add_artifact(source, path=media.artifact_path, mime_type=media.mime_type, copy=True)
        return self.spool.add_media(
            key=media.key,
            step=media.step,
            kind=media.kind,
            artifact_path=media.artifact_path,
            caption=media.caption,
            metadata=media.metadata,
            media_id=media.id,
        )

    def close(self) -> None:
        self.spool.close()


class AutoRunTransport:
    """書き込みがAPIに届かなくなるまではonline、そのあとはRunが終わるまでspool。

    切り替え前にAPIに届いた書き込みは、spoolに書き直さない。spoolのsync-stateがRunの存在を
    記録しているので、syncは切り替え後のものだけを送る。失敗した書き込み自体はspoolに書く。
    APIに届いていたかもしれないが、失うよりは送り直す方を選ぶ。
    """

    def __init__(self, online: HttpRunTransport, open_spool: Callable[[], RunSpool]):
        self.online = online
        self._open_spool = open_spool
        self._offline: SpoolRunTransport | None = None
        self._switch_lock = threading.Lock()

    @property
    def offline_directory(self) -> Path | None:
        return self._offline.offline_directory if self._offline else None

    def start(self) -> dict[str, Any] | None:
        return self._send(lambda transport: transport.start())

    def finish(self, status: str) -> dict[str, Any] | None:
        return self._send(lambda transport: transport.finish(status))

    def log_metrics(self, points: list[dict[str, Any]]) -> None:
        self._send(lambda transport: transport.log_metrics(points))

    def log_params(self, parameters: Mapping[str, Any]) -> dict[str, Any] | None:
        return self._send(lambda transport: transport.log_params(parameters))

    def set_tags(self, tags: Mapping[str, str]) -> dict[str, Any] | None:
        return self._send(lambda transport: transport.set_tags(tags))

    def log_entries(self, entries: list[dict[str, Any]]) -> None:
        self._send(lambda transport: transport.log_entries(entries))

    def log_artifact(
        self, source: Path | BinaryIO, *, path: str, mime_type: str, copy: bool
    ) -> dict[str, Any]:
        if not isinstance(source, Path):
            # 失敗したアップロードが読んだストリームは、spoolのためにもう一度読むことはできない。
            return self._send(
                lambda transport: transport.log_artifact(source, path=path, mime_type=mime_type, copy=copy),
                retry_offline=False,
            )
        return self._send(
            lambda transport: transport.log_artifact(source, path=path, mime_type=mime_type, copy=copy)
        )

    def log_media(self, source: Path, media: RunMediaItem) -> dict[str, Any]:
        # spoolに書くときはファイルを保存し直す。アップロードが成功していても、syncにはspoolの
        # ファイルが要る。
        return self._send(lambda transport: transport.log_media(source, media))

    def close(self) -> None:
        if self._offline is not None:
            self._offline.close()

    def _send(self, write: Callable[[RunTransport], Result], *, retry_offline: bool = True) -> Result:
        if self._offline is not None:
            return write(self._offline)
        try:
            return write(self.online)
        except ApiError as error:
            if not is_api_unreachable(error):
                raise
            offline = self._switch_to_offline()
            if not retry_offline:
                raise
            return write(offline)

    def _switch_to_offline(self) -> SpoolRunTransport:
        with self._switch_lock:
            if self._offline is None:
                self._offline = SpoolRunTransport(self._open_spool())
                print(
                    f"mado-tracking: the API is unreachable; Run {self.online.run_id} continues in "
                    f"{self._offline.offline_directory}. Send it later with `mado-tracking sync`.",
                    file=sys.stderr,
                )
            return self._offline
