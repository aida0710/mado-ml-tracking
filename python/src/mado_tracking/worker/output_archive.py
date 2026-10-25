"""コンテナの出力を、圧縮しない1本のtarストリームにする。runnerが書き、workerが読む。

最初のメンバーは出力のインデックス（検証済みの記述子のJSON Lines）。宣言したファイルが
インデックスの順に続き、workerが確認済みのものは飛ばす。受け付けるのはPAXの拡張ヘッダーと
通常のファイルだけなので、リンク・ディレクトリ・デバイスが展開されることは無い。
"""

from __future__ import annotations

import asyncio
import json
import os
import sys
import tarfile
from collections.abc import AsyncIterator
from dataclasses import dataclass
from pathlib import Path
from typing import IO

from .container_outputs import (
    artifact_key,
    finished_results,
    open_output,
    output_path_parts,
    parse_output_index,
    read_output_index,
)
from .host_state import read_state

OUTPUT_ARCHIVE_COMMAND = "output-archive"
# 読む側はインデックスを位置（常に先頭）で見分ける。名前は`tar tvf`で見るときの手がかりにすぎない。
INDEX_MEMBER_NAME = ".mmt/output-index.jsonl"
# sysexitsのEX_DATAERR: runnerが出力を拒んだので、転送を再試行しても成功しない。
ARCHIVE_REJECTED_EXIT_CODE = 65
# 両端でコピーのバッファに上限を設ける。ファイルの中身を丸ごとメモリに持つことは無い。
ARCHIVE_CHUNK_BYTES = 1024 * 1024
# PAXヘッダーが持つのは長いパス1つ（最大1024バイト）とサイズ。それより大きいものは不正。
MAX_PAX_HEADER_BYTES = 64 * 1024
# どの出力も、確認済みのキー（パス、sha256、クォート）は1ファイルあたりこのバイト数に収まる。
MAX_ACKNOWLEDGED_KEY_BYTES = 4096
REGULAR_FILE_TYPES = {tarfile.REGTYPE, tarfile.AREGTYPE}


class ArchiveFormatError(ValueError):
    """このストリームは、このプロトコルが作る出力のアーカイブではない。再試行しても直らない。"""


class ArchiveTruncated(EOFError):
    """ストリームが早く終わったか止まった。確認されていないファイルについて転送を再試行してよい。"""


@dataclass(frozen=True)
class ArchiveMember:
    path: str
    size: int


def write_output_archive(
    destination: IO[bytes], outputs: Path, index: bytes, *, acknowledged: set[str]
) -> None:
    with tarfile.open(fileobj=destination, mode="w|", format=tarfile.PAX_FORMAT) as archive:
        index_member = tarfile.TarInfo(INDEX_MEMBER_NAME)
        index_member.size = len(index)
        archive.addfile(index_member, _BytesReader(index))
        for artifact in parse_output_index(index):
            if artifact_key(artifact) in acknowledged:
                continue
            with open_output(outputs, artifact["path"]) as content:
                if os.fstat(content.fileno()).st_size != artifact["size"]:
                    raise ValueError("Container output changed after completion")
                member = tarfile.TarInfo(artifact["path"])
                member.size = artifact["size"]
                archive.addfile(member, content)


class _BytesReader:
    def __init__(self, content: bytes):
        self.content = memoryview(content)
        self.offset = 0

    def read(self, size: int = -1) -> bytes:
        end = len(self.content) if size < 0 else self.offset + size
        chunk = bytes(self.content[self.offset : end])
        self.offset += len(chunk)
        return chunk


def run_output_archive_command(argv: list[str]) -> None:
    """runnerの入口: `output-archive <workspace>`。stdinに`{"acknowledged": [...]}`を渡す。"""
    try:
        workspace = Path(argv[2]).expanduser().resolve()
        if not workspace.is_dir():
            raise ValueError("Job workspace is unavailable")
        results = finished_results(read_state(workspace))
        index = read_output_index(workspace, results)
        maximum_request_bytes = (results["artifactCount"] + 1) * MAX_ACKNOWLEDGED_KEY_BYTES
        raw_request = sys.stdin.buffer.read(maximum_request_bytes + 1)
        if len(raw_request) > maximum_request_bytes:
            raise ValueError("Acknowledged output list exceeds its size limit")
        acknowledged = json.loads(raw_request or b"{}").get("acknowledged", [])
        if not isinstance(acknowledged, list) or not all(isinstance(key, str) for key in acknowledged):
            raise ValueError("Acknowledged outputs must be a list of keys")
        write_output_archive(sys.stdout.buffer, workspace / "outputs", index, acknowledged=set(acknowledged))
        sys.stdout.buffer.flush()
    except (OSError, ValueError, KeyError, TypeError, tarfile.TarError) as error:
        sys.stderr.write(f"Container output archive rejected: {error}\n")
        sys.exit(ARCHIVE_REJECTED_EXIT_CODE)


class OutputArchiveReader:
    def __init__(self, stream: asyncio.StreamReader, *, idle_timeout_seconds: float):
        self.stream = stream
        self.idle_timeout_seconds = idle_timeout_seconds
        self.remaining = 0
        self.finished = False

    async def read_index(self, *, maximum_bytes: int) -> bytes:
        member = await self.next_member()
        if member is None or member.path != INDEX_MEMBER_NAME:
            raise ArchiveFormatError("Output archive must start with the output index")
        if member.size > maximum_bytes:
            raise ArchiveFormatError("Output index exceeds its size limit")
        return b"".join([chunk async for chunk in self.content(member)])

    async def next_member(self) -> ArchiveMember | None:
        """次の通常のファイル。アーカイブの終端の印のあとはNone。"""
        if self.remaining:
            raise ArchiveFormatError("The previous member was not read completely")
        extended: dict[str, str] = {}
        while True:
            block = await self._read_exactly(tarfile.BLOCKSIZE)
            if block == bytes(tarfile.BLOCKSIZE):
                await self._finish()
                return None
            try:
                header = tarfile.TarInfo.frombuf(block, "utf-8", "surrogateescape")
            except tarfile.HeaderError:
                raise ArchiveFormatError("Output archive has an invalid tar header") from None
            if header.type == tarfile.XHDTYPE:
                if header.size > MAX_PAX_HEADER_BYTES:
                    raise ArchiveFormatError("Output archive PAX header is too large")
                raw_records = await self._read_exactly(_padded(header.size))
                extended.update(_parse_pax_records(raw_records[: header.size]))
                continue
            if header.type not in REGULAR_FILE_TYPES:
                raise ArchiveFormatError("Output archive may contain only regular files")
            path = extended.get("path", header.name)
            try:
                size = int(extended["size"]) if "size" in extended else header.size
            except ValueError:
                raise ArchiveFormatError("Output archive member has an invalid size") from None
            try:
                output_path_parts(path)
            except ValueError:
                raise ArchiveFormatError("Output archive member path is not a declared output") from None
            if size < 0:
                raise ArchiveFormatError("Output archive member has an invalid size")
            self.remaining = size
            return ArchiveMember(path=path, size=size)

    async def content(self, member: ArchiveMember) -> AsyncIterator[bytes]:
        while self.remaining:
            chunk = await self._read_exactly(min(ARCHIVE_CHUNK_BYTES, self.remaining))
            self.remaining -= len(chunk)
            yield chunk
        await self._read_exactly(_padded(member.size) - member.size)

    async def _finish(self) -> None:
        # Pythonのtarの書き込みは10KiBのレコードまで埋める。
        # 終端の印のあとに続いてよいのはゼロのブロックだけ。
        trailer = await self._read_to_end(maximum_bytes=tarfile.RECORDSIZE)
        if trailer.strip(b"\x00"):
            raise ArchiveFormatError("Output archive has data after its end marker")
        self.finished = True

    async def _read_exactly(self, size: int) -> bytes:
        try:
            async with asyncio.timeout(self.idle_timeout_seconds):
                return await self.stream.readexactly(size)
        except asyncio.IncompleteReadError:
            raise ArchiveTruncated("Output archive ended before all declared files arrived") from None
        except TimeoutError:
            raise ArchiveTruncated("Output archive stalled") from None

    async def _read_to_end(self, *, maximum_bytes: int) -> bytes:
        trailer = bytearray()
        async with asyncio.timeout(self.idle_timeout_seconds):
            while chunk := await self.stream.read(ARCHIVE_CHUNK_BYTES):
                trailer.extend(chunk)
                if len(trailer) > maximum_bytes:
                    raise ArchiveFormatError("Output archive has data after its end marker")
        return bytes(trailer)


def _padded(size: int) -> int:
    return -(-size // tarfile.BLOCKSIZE) * tarfile.BLOCKSIZE


def _parse_pax_records(raw: bytes) -> dict[str, str]:
    """`<length> <key>=<value>\\n`のレコード（POSIXのpax拡張ヘッダー）。"""
    records: dict[str, str] = {}
    offset = 0
    while offset < len(raw):
        space = raw.find(b" ", offset)
        try:
            length = int(raw[offset:space])
        except ValueError:
            raise ArchiveFormatError("Output archive PAX header is malformed") from None
        record = raw[space + 1 : offset + length]
        if length <= 0 or space < 0 or not record.endswith(b"\n") or b"=" not in record:
            raise ArchiveFormatError("Output archive PAX header is malformed")
        key, value = record[:-1].split(b"=", 1)
        records[key.decode("utf-8", "surrogateescape")] = value.decode("utf-8", "surrogateescape")
        offset += length
    return records
