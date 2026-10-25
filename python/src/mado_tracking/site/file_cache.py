"""1つのsiteのwork directoryのJobが共有する、変わらないファイル（SIFイメージ）。

    <work dir>/.mmt-cache/<kind>/<name>:       ファイル本体。完成したら読み取り専用
    <work dir>/.mmt-cache/<kind>/<name>.json:  {"sha256", "size"}。最後に書く
    <work dir>/.mmt-cache/<kind>/<name>.lock:  項目を確かめる間、または埋める間に持つflock

arrayのJobはロックで互いを待つので、ファイルの取得や変換は1回で済む。Jobはファイルを
自分のworkspaceにリンクし、そこでコンテナの起動前にもう一度検証する。
"""

from __future__ import annotations

import asyncio
import fcntl
import os
import shutil
from collections.abc import AsyncIterator, Awaitable, Callable
from contextlib import asynccontextmanager
from dataclasses import dataclass
from pathlib import Path

from ..checkpoint_archive import file_sha256
from ..errors import ConfigurationError
from ..worker.dataset_cache import CACHE_DIRECTORY
from ..worker.host_state import read_json, write_json
from .daemon_thread import run_in_daemon_thread

# 待っているJobはこの間隔でロックを確かめる。その間もheartbeatは送り続ける。
LOCK_POLL_SECONDS = 1.0
READ_ONLY_FILE_MODE = 0o400


@dataclass(frozen=True)
class CachedFile:
    path: Path
    sha256: str
    size: int


class SiteFileCache:
    def __init__(self, root: Path):
        self.root = root

    @classmethod
    def in_work_directory(cls, work_directory: Path, kind: str) -> SiteFileCache:
        # データセットのキャッシュ（<work dir>/.mmt-cache/datasets）の隣。
        return cls(work_directory / CACHE_DIRECTORY.parent / kind)

    @asynccontextmanager
    async def _locked(self, name: str) -> AsyncIterator[None]:
        self.root.mkdir(mode=0o700, parents=True, exist_ok=True)
        with (self.root / f"{name}.lock").open("a") as lock:
            while True:
                try:
                    fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
                    break
                except BlockingIOError:
                    await asyncio.sleep(LOCK_POLL_SECONDS)
            try:
                yield
            finally:
                fcntl.flock(lock, fcntl.LOCK_UN)

    async def ensure(
        self,
        name: str,
        fill: Callable[[Path], Awaitable[None]],
        *,
        expected_sha256: str | None = None,
    ) -> CachedFile:
        """完成した項目。無いか、途中のまま残っていれば、先に埋める。"""
        if not name or "/" in name or name.startswith("."):
            raise ConfigurationError(f"Invalid cache entry name {name!r}")
        path, marker = self.root / name, self.root / f"{name}.json"
        async with self._locked(name):
            if marker.is_file() and path.is_file():
                record = read_json(marker)
                if path.stat().st_size == record.get("size") and (
                    expected_sha256 is None or record.get("sha256") == expected_sha256
                ):
                    return CachedFile(path, str(record["sha256"]), int(record["size"]))
            # markerの無い項目は、埋める途中で中断されたもの。決して使わない。
            marker.unlink(missing_ok=True)
            partial = self.root / f".{name}.partial"
            partial.unlink(missing_ok=True)
            try:
                await fill(partial)
                checksum, size = await run_in_daemon_thread(lambda: file_sha256(partial), name="mmt-hash")
                if expected_sha256 is not None and checksum != expected_sha256:
                    raise ConfigurationError(f"Cached file {name} does not match its sha256")
                partial.chmod(READ_ONLY_FILE_MODE)
                os.replace(partial, path)
                write_json(marker, {"sha256": checksum, "size": size})
            finally:
                partial.unlink(missing_ok=True)
            return CachedFile(path, checksum, size)

    def link(self, cached: CachedFile, destination: Path) -> None:
        """ファイルをdestinationに置く。同じファイルシステムならハードリンク、違えばコピー。"""
        destination.unlink(missing_ok=True)
        try:
            os.link(cached.path, destination)
        except OSError:
            shutil.copyfile(cached.path, destination)
