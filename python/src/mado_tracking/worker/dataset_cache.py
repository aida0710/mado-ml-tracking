"""入力のDatasetVersionのファイルのキャッシュ（コンピュータ側）。作業ディレクトリの全Jobで共有する。

<workDirectory>/.mmt-cache/datasetsの下の構成：

    <key>.lock            flock。エントリを確かめる・埋める・消す間に持つ
    .cache.lock           flock。キャッシュの合計サイズを計算して減らす間に持つ
    <key>/data/           ファイル。そろったら読み取り専用になる（Jobが読むもの）
    <key>/files.json      sha256の値を含む、確かめたパスとサイズ
    <key>/complete.json   fillの完了の目印。これが無いエントリは、fillが途中で止まったもの
    <key>/last-used       mtimeで、使われていない期間が長いものから消す順を決める
    <key>/users/<jobId>   pin。エントリを読むJobのworkspace

コンピュータ用のrunnerのバンドルの中で動くので、標準ライブラリだけを使う。
"""

from __future__ import annotations

import fcntl
import hashlib
import json
import os
import re
import shutil
import stat
import time
from collections.abc import Callable, Iterator
from contextlib import contextmanager
from pathlib import Path
from typing import Any

from .host_state import read_json, write_json

CACHE_DIRECTORY = Path(".mmt-cache") / "datasets"
DATA_DIRECTORY = "data"
COMPLETE_MARKER = "complete.json"
# 確かめたファイルの一覧。サイズの集計で10万件の文書を読まずに済むよう、別のファイルにしておく。
FILES_DOCUMENT = "files.json"
LAST_USED_FILE = "last-used"
USERS_DIRECTORY = "users"
CACHE_LOCK_FILE = ".cache.lock"
KEY_PATTERN = re.compile(r"^[a-z0-9][a-z0-9-]{0,99}$")
TERMINAL_JOB_STATUSES = {"finished", "failed", "canceled"}
# 配置は起動の直前に行うので、これだけの間始まらなかったworkspaceは放置されたもの（たとえば、
# 後の入力でworkerがJobを失敗にし、releaseが届かなかったとき）。
UNSTARTED_PIN_MAX_AGE_SECONDS = 24 * 3600
HASH_CHUNK_BYTES = 1024 * 1024


class DatasetCacheError(ValueError):
    """ファイルがDatasetVersionの示す内容と合わない、またはキャッシュに収まらない。"""


def file_checksum(path: Path) -> tuple[str, int]:
    checksum, size = hashlib.sha256(), 0
    with path.open("rb") as content:
        while chunk := content.read(HASH_CHUNK_BYTES):
            checksum.update(chunk)
            size += len(chunk)
    return checksum.hexdigest(), size


def verify_files(data_directory: Path, expected: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """期待するファイルがすべてあり、ほかには無いこと。sha256がNoneなら、代わりに計算して返す。"""
    found = {
        path.relative_to(data_directory).as_posix(): path
        for path in data_directory.rglob("*")
        if not path.is_dir() or path.is_symlink()
    }
    if set(found) != {entry["path"] for entry in expected}:
        raise DatasetCacheError("Dataset files differ from the DatasetVersion's file list")
    verified = []
    for entry in expected:
        path = found[entry["path"]]
        if path.is_symlink() or not stat.S_ISREG(path.lstat().st_mode):
            raise DatasetCacheError(f"Dataset file is not a regular file: {entry['path']}")
        checksum, size = file_checksum(path)
        if (entry.get("size") is not None and size != entry["size"]) or (
            entry.get("sha256") is not None and checksum != entry["sha256"]
        ):
            raise DatasetCacheError(f"Dataset file sha256 or size mismatch: {entry['path']}")
        verified.append({"path": entry["path"], "sha256": checksum, "size": size})
    return verified


def _make_read_only(directory: Path) -> None:
    # ホストのpythonで動くJobは、読み取り専用のマウントではなくシンボリックリンクを通して読む。
    for path in directory.rglob("*"):
        path.chmod(0o500 if path.is_dir() else 0o400)
    directory.chmod(0o500)


def _remove_tree(path: Path) -> None:
    if not path.exists():
        return
    for child in [path, *path.rglob("*")]:
        if child.is_dir() and not child.is_symlink():
            child.chmod(0o700)
    shutil.rmtree(path)


class DatasetCache:
    def __init__(self, root: Path):
        self.root = root

    @classmethod
    def for_workspace(cls, workspace: Path) -> DatasetCache:
        # Jobのworkspaceは<workDirectory>/<jobId>なので、キャッシュはworkspaceの隣に置く。
        return cls(workspace.parent / CACHE_DIRECTORY)

    def entry(self, key: str) -> Path:
        if not KEY_PATTERN.fullmatch(key):
            raise DatasetCacheError("Invalid dataset cache key")
        return self.root / key

    def data_path(self, key: str) -> Path:
        return self.entry(key) / DATA_DIRECTORY

    def is_complete(self, key: str) -> bool:
        return (self.entry(key) / COMPLETE_MARKER).is_file()

    @contextmanager
    def _lock(self, name: str, *, blocking: bool = True) -> Iterator[bool]:
        self.root.mkdir(mode=0o700, parents=True, exist_ok=True)
        with (self.root / name).open("a") as lock:
            try:
                fcntl.flock(lock, fcntl.LOCK_EX | (0 if blocking else fcntl.LOCK_NB))
            except BlockingIOError:
                yield False
                return
            yield True

    def materialize(
        self,
        key: str,
        *,
        files: list[dict[str, Any]] | None,
        total_size: int | None,
        max_bytes: int,
        workspace: Path,
        fill: Callable[[Path], list[dict[str, Any]]] | None,
    ) -> dict[str, Any]:
        """完了したエントリを返す。無ければ`fill`で埋める。

        `files`は、埋めたデータが一致すべき一覧。Noneのとき（ダウンロードするまで中身が
        分からない参照）は、`fill`が返す一覧を使う。

        fillの間ずっとキーのロックを持つので、同じキーの2つ目のJobは待ってから、完了した
        エントリを見つける。そのためファイルの取得は1回で済む。`fill`が無ければ、エントリが
        無いことをそのまま報告する（workerは2つ目のコマンドでファイルを中継する）。
        """
        if total_size is not None and total_size > max_bytes:
            raise DatasetCacheError("The DatasetVersion is larger than the target's dataset cache limit")
        entry = self.entry(key)
        with self._lock(f"{key}.lock"):
            if self.is_complete(key):
                self._pin(entry, workspace)
                return {"status": "cached", "path": str(entry / DATA_DIRECTORY)}
            if fill is None:
                return {"status": "missing"}
            # 目印が無いのは、前のfillが途中で止まったということ。そのファイルは信用しない。
            _remove_tree(entry)
            over_limit = self._evict(max_bytes=max_bytes, needed=total_size or 0, keep=key)
            (entry / DATA_DIRECTORY).mkdir(mode=0o700, parents=True)
            try:
                listed = fill(entry / DATA_DIRECTORY)
                verified = verify_files(entry / DATA_DIRECTORY, files if files is not None else listed)
                if sum(file["size"] for file in verified) > max_bytes:
                    raise DatasetCacheError("The dataset is larger than the target's dataset cache limit")
            except BaseException:
                _remove_tree(entry)
                raise
            size = sum(file["size"] for file in verified)
            _make_read_only(entry / DATA_DIRECTORY)
            write_json(entry / FILES_DOCUMENT, {"files": verified})
            # 最後に書く。これがあることで、エントリが使えるようになる。
            write_json(
                entry / COMPLETE_MARKER,
                {"key": key, "totalSize": size, "fileCount": len(verified), "completedAt": time.time()},
            )
            self._pin(entry, workspace)
        return {"status": "fetched", "path": str(entry / DATA_DIRECTORY), "overLimit": over_limit}

    def release(self, workspace: Path) -> None:
        """このJobのpinを外す（起動前に失敗したので、入力を読まない）。"""
        if not self.root.is_dir():
            return
        for pin in self.root.glob(f"*/{USERS_DIRECTORY}/{workspace.name}"):
            pin.unlink(missing_ok=True)

    def _pin(self, entry: Path, workspace: Path) -> None:
        users = entry / USERS_DIRECTORY
        users.mkdir(mode=0o700, exist_ok=True)
        (users / workspace.name).write_text(str(workspace))
        (entry / LAST_USED_FILE).touch()
        os.utime(entry / LAST_USED_FILE)

    def _in_use(self, entry: Path) -> bool:
        users = entry / USERS_DIRECTORY
        if not users.is_dir():
            return False
        return any(_pin_is_live(pin) for pin in users.iterdir())

    def _evict(self, *, max_bytes: int, needed: int, keep: str) -> bool:
        """pinの無いエントリを使われていない期間が長い順に、`needed`バイトがさらに入るまで消す。

        使用中のエントリのせいでキャッシュが上限を超えたままならTrueを返す。その場合もfillは
        進める。ほかのJobの入力のためにJobを失敗させても、待ちが移るだけだから。
        """
        with self._lock(CACHE_LOCK_FILE):
            complete: list[tuple[float, int, str]] = []
            for entry in self.root.iterdir():
                if not entry.is_dir() or entry.name == keep or not KEY_PATTERN.fullmatch(entry.name):
                    continue
                marker = entry / COMPLETE_MARKER
                if not marker.is_file():
                    # 誰もロックを持っていない、途中で止まったfillはゴミ。
                    with self._lock(f"{entry.name}.lock", blocking=False) as acquired:
                        if acquired and not marker.is_file():
                            _remove_tree(entry)
                    continue
                last_used = entry / LAST_USED_FILE
                used_at = last_used.stat().st_mtime if last_used.exists() else marker.stat().st_mtime
                complete.append((used_at, int(read_json(marker)["totalSize"]), entry.name))
            total = sum(size for _used_at, size, _key in complete)
            for _used_at, size, key in sorted(complete):
                if total + needed <= max_bytes:
                    break
                with self._lock(f"{key}.lock", blocking=False) as acquired:
                    if not acquired or self._in_use(self.root / key):
                        continue
                    _remove_tree(self.root / key)
                    total -= size
            return total + needed > max_bytes


def _pin_is_live(pin: Path) -> bool:
    """Jobがまだ読むかもしれない間はpinを保つ。終了状態でなく、長く放置されてもいないこと。"""
    try:
        workspace = Path(pin.read_text())
        state_path = workspace / "state.json"
        if state_path.exists():
            return json.loads(state_path.read_text()).get("status") not in TERMINAL_JOB_STATUSES
        return workspace.is_dir() and time.time() - pin.stat().st_mtime < UNSTARTED_PIN_MAX_AGE_SECONDS
    except (OSError, ValueError):
        # 読めないpinは残す。Jobが読んでいるファイルを消すほうが、キャッシュが一杯になるより悪い。
        return True
