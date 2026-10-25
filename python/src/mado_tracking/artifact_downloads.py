"""中断したArtifactのダウンロードをRangeで再開し、バージョンが変わっていないことを確かめる。

Rangeでの再開は、identityエンコーディングの本文にだけ使える。圧縮した中身の中のバイト位置は、
保存されたファイルにとって意味が無い。contentのエンドポイントが返す強いETag `"sha256-<hex>"`が
Artifactのバージョンを表すので、再開のリクエストには`If-Range`を付け、バージョンが変わって
いれば最初からやり直す。
"""

from __future__ import annotations

import asyncio
import hashlib
import re
import time
from collections.abc import AsyncIterable, Awaitable, Callable, Iterable, Mapping
from typing import Any, BinaryIO

import httpx

from .errors import ApiError
from .http import RETRYABLE_STATUS, check_response, retry_delay
from .security import SecretMasker

# 中断したら受け取った位置から再試行する。上限は、回復しない回線で止めるためのもの。
DOWNLOAD_RESUME_ATTEMPTS = 6
IDENTITY_HEADERS = {"Accept-Encoding": "identity"}
SHA256_ENTITY_TAG = re.compile(r'^"sha256-([0-9a-f]{64})"$')
CONTENT_RANGE = re.compile(r"^bytes (\d+)-(\d+)/(\d+)$")
INTERRUPTIONS = (httpx.TransportError, httpx.StreamError)


EncodedFallback = Callable[[httpx.Response], Awaitable[dict[str, Any]]]


class ResumableDownload:
    """シークできる書き込み先へ、これまでに受け取ったArtifactの1バージョン分のバイト列。"""

    def __init__(self, destination: BinaryIO, *, label: str, maximum_bytes: int | None = None):
        self.destination = destination
        self.label = label
        self.maximum_bytes = maximum_bytes
        self.entity_tag: str | None = None
        self.total_size: int | None = None
        self.received = 0
        self.checksum = hashlib.sha256()

    def request_headers(self) -> dict[str, str]:
        if not self.can_resume():
            return dict(IDENTITY_HEADERS)
        assert self.entity_tag is not None
        return {**IDENTITY_HEADERS, "Range": f"bytes={self.received}-", "If-Range": self.entity_tag}

    def can_resume(self) -> bool:
        # 強い検証子が無いと、再開した本文が別のバージョンのものかもしれない。
        return self.received > 0 and self.entity_tag is not None

    def accept_response(self, status_code: int, headers: Mapping[str, str]) -> None:
        """応答のバイト列を1つも書く前に、応答を検証する。"""
        if not is_identity_encoded(headers):
            raise ApiError(f"{self.label} download must use identity encoding to be resumable")
        entity_tag = strong_entity_tag(headers.get("etag"))
        if status_code == 206:
            start, total = parse_content_range(headers.get("content-range"))
            if not self.can_resume() or entity_tag != self.entity_tag or start != self.received:
                raise ApiError(f"{self.label} download returned an unexpected byte range")
            self.total_size = total
        elif status_code == 200:
            # If-Rangeが一致しなかった（バージョンが変わった）か、サーバーがRangeを無視した。
            # 最初からやり直す。
            if self.received:
                self.restart()
            self.entity_tag = entity_tag
            length = headers.get("content-length")
            self.total_size = int(length) if length is not None and length.isdigit() else None
        else:
            raise ApiError(f"{self.label} download returned an unexpected status ({status_code})")
        if self.maximum_bytes is not None and (self.total_size or 0) > self.maximum_bytes:
            raise ValueError(f"{self.label} exceeds its download size limit")

    def restart(self) -> None:
        self.destination.seek(0)
        self.destination.truncate()
        self.received = 0
        self.checksum = hashlib.sha256()

    def write(self, chunk: bytes) -> None:
        if self.maximum_bytes is not None and self.received + len(chunk) > self.maximum_bytes:
            raise ValueError(f"{self.label} exceeds its download size limit")
        self.destination.write(chunk)
        self.checksum.update(chunk)
        self.received += len(chunk)

    def finish(self) -> dict[str, Any]:
        # 大きさの宣言が無ければ、エラー無しで終わった本文を全体とみなす。
        if self.total_size is not None and self.received != self.total_size:
            raise ApiError(f"{self.label} download transfer size mismatch")
        digest = self.checksum.hexdigest()
        expected = artifact_sha256(self.entity_tag)
        if expected is not None and digest != expected:
            raise ApiError(f"{self.label} download sha256 does not match its version")
        return {"sha256": digest, "size": self.received}


def is_identity_encoded(headers: Mapping[str, str]) -> bool:
    return headers.get("content-encoding", "identity").strip().lower() in {"", "identity"}


def strong_entity_tag(header: str | None) -> str | None:
    if not header or header.startswith("W/"):
        return None
    return header.strip()


def artifact_sha256(entity_tag: str | None) -> str | None:
    match = SHA256_ENTITY_TAG.match(entity_tag or "")
    return match.group(1) if match else None


def parse_content_range(header: str | None) -> tuple[int, int]:
    match = CONTENT_RANGE.match((header or "").strip())
    if not match:
        raise ApiError("Partial download has no valid Content-Range")
    start, end, total = (int(group) for group in match.groups())
    if end < start or end >= total:
        raise ApiError("Partial download has no valid Content-Range")
    return start, total


def should_resume_after(error: ApiError, download: ResumableDownload) -> bool:
    # 最初のリクエストの失敗は呼び出し側が再試行する。再開する価値があるのは受け取ったバイト列だけ。
    return download.can_resume() and error.status_code in RETRYABLE_STATUS


def raw_chunks(response: httpx.Response) -> Iterable[bytes]:
    # Response(content=...)は本文を先に読み切るので、まだ持っている元のバイト列を流し直す。
    if response.is_stream_consumed and isinstance(response.stream, httpx.SyncByteStream):
        return response.stream
    # chunk_sizeは指定しない。一定の大きさまでバッファに溜めると、回線が切れたときに
    # 溜めていたバイト列を失う。
    return response.iter_raw()


def raw_chunks_async(response: httpx.Response) -> AsyncIterable[bytes]:
    if response.is_stream_consumed and isinstance(response.stream, httpx.AsyncByteStream):
        return response.stream
    return response.aiter_raw()


def download_resumable_sync(
    client: httpx.Client,
    path: str,
    destination: BinaryIO,
    *,
    masker: SecretMasker,
    label: str = "Artifact",
    maximum_bytes: int | None = None,
) -> dict[str, Any]:
    download = ResumableDownload(destination, label=label, maximum_bytes=maximum_bytes)
    for attempt in range(DOWNLOAD_RESUME_ATTEMPTS):
        try:
            with client.stream("GET", path, headers=download.request_headers()) as response:
                if not response.is_success:
                    response.read()
                    check_response(response, masker)
                download.accept_response(response.status_code, response.headers)
                for chunk in raw_chunks(response):
                    download.write(chunk)
            # 通信エラー無しで終わった本文はそれで完結とみなす。短ければ大きさの不一致とする。
            return download.finish()
        except INTERRUPTIONS:
            pass
        except ApiError as error:
            if not should_resume_after(error, download) or attempt == DOWNLOAD_RESUME_ATTEMPTS - 1:
                raise
        if attempt < DOWNLOAD_RESUME_ATTEMPTS - 1:
            time.sleep(retry_delay(attempt))
    raise ApiError(f"{label} download kept failing after {DOWNLOAD_RESUME_ATTEMPTS} attempts")


async def download_resumable_async(
    client: httpx.AsyncClient,
    path: str,
    destination: BinaryIO,
    *,
    masker: SecretMasker,
    label: str = "Artifact",
    maximum_bytes: int | None = None,
    encoded_fallback: EncodedFallback | None = None,
) -> dict[str, Any]:
    """`encoded_fallback`は圧縮された本文を1回で書く。そのような本文は再開できない。"""
    download = ResumableDownload(destination, label=label, maximum_bytes=maximum_bytes)
    for attempt in range(DOWNLOAD_RESUME_ATTEMPTS):
        try:
            async with client.stream("GET", path, headers=download.request_headers()) as response:
                if not response.is_success:
                    await response.aread()
                    check_response(response, masker)
                if encoded_fallback is not None and not is_identity_encoded(response.headers):
                    download.restart()
                    return await encoded_fallback(response)
                download.accept_response(response.status_code, response.headers)
                async for chunk in raw_chunks_async(response):
                    download.write(chunk)
            # 通信エラー無しで終わった本文はそれで完結とみなす。短ければ大きさの不一致とする。
            return download.finish()
        except INTERRUPTIONS:
            pass
        except ApiError as error:
            if not should_resume_after(error, download) or attempt == DOWNLOAD_RESUME_ATTEMPTS - 1:
                raise
        if attempt < DOWNLOAD_RESUME_ATTEMPTS - 1:
            await asyncio.sleep(retry_delay(attempt))
    raise ApiError(f"{label} download kept failing after {DOWNLOAD_RESUME_ATTEMPTS} attempts")
