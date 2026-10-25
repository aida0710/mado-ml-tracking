"""学習のcheckpointのtarの構成。SDK、worker、コンピュータ側のrunnerが共有する。

標準ライブラリだけを使う。コンピュータ側のrunnerは、SDKの依存関係無しでこのモジュールを同梱する。
アーカイブに入れるのは通常のファイルとディレクトリだけで、パスは安全な相対パスに限る。
"""

from __future__ import annotations

import hashlib
import os
import re
import stat
import tarfile
from collections.abc import Iterable, Sequence
from pathlib import Path, PurePosixPath
from typing import Any, BinaryIO

# APIのMAX_CHECKPOINT_FILESに合わせ、APIが受け付けるmanifestなら必ずアーカイブにできるようにする。
MAX_CHECKPOINT_FILES = 10000
HASH_CHUNK_BYTES = 1024 * 1024
# 所有者だけが読める。checkpointから再開するコードに入力を書き換えさせない。
READ_ONLY_FILE_MODE = 0o400
READ_ONLY_DIRECTORY_MODE = 0o500


class CheckpointArchiveError(ValueError):
    """checkpointのファイルがmanifestと一致しない、またはアーカイブが安全でない。"""


def is_safe_relative_path(path: str) -> bool:
    """APIのArtifactのパスの規則。相対パスで、バックスラッシュ・制御文字・%XXを含まない。"""
    return (
        bool(path)
        and not path.startswith("/")
        and not re.search(r"[\\\x00-\x1f\x7f]|%[0-9A-Fa-f]{2}", path)
        and all(part not in {"", ".", ".."} for part in path.split("/"))
    )


def file_sha256(path: Path) -> tuple[str, int]:
    checksum, size = hashlib.sha256(), 0
    with path.open("rb") as content:
        while chunk := content.read(HASH_CHUNK_BYTES):
            checksum.update(chunk)
            size += len(chunk)
    return checksum.hexdigest(), size


def directory_manifest(directory: Path) -> list[dict[str, Any]]:
    """directoryの下の通常のファイルをすべて{path, sha256, size}としてパス順に並べる。"""
    root = Path(directory)
    if not root.is_dir() or root.is_symlink():
        raise CheckpointArchiveError("Checkpoint directory must be an existing directory")
    files = []
    for path in sorted(root.rglob("*")):
        if path.is_symlink():
            raise CheckpointArchiveError(f"Checkpoint must not contain symlinks: {path.relative_to(root)}")
        if not path.is_file():
            continue
        checksum, size = file_sha256(path)
        files.append({"path": path.relative_to(root).as_posix(), "sha256": checksum, "size": size})
    if not files:
        raise CheckpointArchiveError("Checkpoint directory has no files")
    if len(files) > MAX_CHECKPOINT_FILES:
        raise CheckpointArchiveError(f"Checkpoint has more than {MAX_CHECKPOINT_FILES} files")
    return files


def write_checkpoint_archive(files: Iterable[tuple[str, Path]], destination: BinaryIO) -> None:
    """（相対パス、ローカルのファイル）の組を、所有者・モード・時刻を固定したtarとして書く。

    メタデータを固定すると、同じファイルのアーカイブはバイト単位で同じになり、sha256は中身だけで
    決まる。
    """
    with tarfile.open(fileobj=destination, mode="w", format=tarfile.PAX_FORMAT) as archive:
        for relative_path, source in sorted(files):
            if not is_safe_relative_path(relative_path):
                raise CheckpointArchiveError(f"Unsafe checkpoint path: {relative_path!r}")
            with source.open("rb") as content:
                information = tarfile.TarInfo(relative_path)
                information.size = os.fstat(content.fileno()).st_size
                information.mode = 0o644
                information.mtime = 0
                archive.addfile(information, content)


def _expected_by_path(expected_files: Sequence[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    expected = {str(file["path"]): file for file in expected_files}
    if len(expected) != len(expected_files):
        raise CheckpointArchiveError("Checkpoint manifest repeats a path")
    return expected


def _regular_members(archive: tarfile.TarFile) -> Iterable[tarfile.TarInfo]:
    count = 0
    for member in archive:
        if member.isdir():
            if not is_safe_relative_path(member.name.rstrip("/")):
                raise CheckpointArchiveError("Checkpoint archive has an unsafe directory")
            continue
        if not member.isreg():
            raise CheckpointArchiveError("Checkpoint archive may only contain regular files")
        if not is_safe_relative_path(member.name):
            raise CheckpointArchiveError("Checkpoint archive has an unsafe path")
        count += 1
        if count > MAX_CHECKPOINT_FILES:
            raise CheckpointArchiveError("Checkpoint archive has too many files")
        yield member


def _copy_member(archive: tarfile.TarFile, member: tarfile.TarInfo, output: BinaryIO | None) -> str:
    content = archive.extractfile(member)
    if content is None:
        raise CheckpointArchiveError("Checkpoint archive member is unreadable")
    checksum = hashlib.sha256()
    while chunk := content.read(HASH_CHUNK_BYTES):
        checksum.update(chunk)
        if output is not None:
            output.write(chunk)
    return checksum.hexdigest()


def _check_member(member: tarfile.TarInfo, checksum: str, expected: dict[str, dict[str, Any]]) -> None:
    entry = expected.get(member.name)
    if entry is None:
        raise CheckpointArchiveError(f"Checkpoint archive has a file outside the manifest: {member.name}")
    if checksum != entry["sha256"] or member.size != entry["size"]:
        raise CheckpointArchiveError(f"Checkpoint file sha256 or size mismatch: {member.name}")


def verify_checkpoint_archive(archive_path: Path, expected_files: Sequence[dict[str, Any]]) -> None:
    """アーカイブがmanifestのファイルを過不足なく、sha256と大きさも一致して持つか確かめる。"""
    expected = _expected_by_path(expected_files)
    seen = set()
    try:
        with tarfile.open(archive_path, mode="r:") as archive:
            for member in _regular_members(archive):
                if member.name in seen:
                    raise CheckpointArchiveError(f"Checkpoint archive repeats a file: {member.name}")
                _check_member(member, _copy_member(archive, member, None), expected)
                seen.add(member.name)
    except tarfile.TarError:
        raise CheckpointArchiveError("Checkpoint archive is not a valid tar") from None
    if seen != set(expected):
        raise CheckpointArchiveError("Checkpoint archive is missing files of its manifest")


def extract_checkpoint_archive(
    archive_path: Path, destination: Path, expected_files: Sequence[dict[str, Any]]
) -> None:
    """検証したアーカイブを新しいディレクトリに展開し、その結果を読み取り専用にする。"""
    verify_checkpoint_archive(archive_path, expected_files)
    expected = _expected_by_path(expected_files)
    destination.mkdir(mode=0o700)
    root = destination.resolve()
    with tarfile.open(archive_path, mode="r:") as archive:
        for member in _regular_members(archive):
            target = root / PurePosixPath(member.name)
            if not target.resolve().is_relative_to(root):
                raise CheckpointArchiveError("Checkpoint archive path escapes its directory")
            target.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
            descriptor = os.open(target, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
            with os.fdopen(descriptor, "wb") as output:
                _check_member(member, _copy_member(archive, member, output), expected)
                output.flush()
                os.fsync(output.fileno())
    make_read_only(root)


def make_read_only(root: Path) -> None:
    # 子から先に処理する。書き込み権限の無いディレクトリでは、その中の項目を変えられない。
    for path in sorted(root.rglob("*"), key=lambda item: len(item.parts), reverse=True):
        mode = os.lstat(path).st_mode
        if stat.S_ISDIR(mode):
            path.chmod(READ_ONLY_DIRECTORY_MODE)
        elif stat.S_ISREG(mode):
            path.chmod(READ_ONLY_FILE_MODE)
    root.chmod(READ_ONLY_DIRECTORY_MODE)
