"""HTTPの本文を最後まで読む。エンコードされた転送の長さと、保存するバイト数は分けて数える。"""

from __future__ import annotations

import hashlib
import zlib
from collections.abc import AsyncIterable, AsyncIterator
from typing import Any, BinaryIO

import httpx

from ..errors import ApiError

# 追加のパッケージなしでストリームの終端を確かめられる、
# 標準のエンコーディングだけを受け付けると伝える。
DOWNLOAD_ACCEPT_ENCODING = "gzip, deflate"
# zlibのgzipモードはラッパーとトレーラーも扱う。DEFLATEの判別には先頭の2バイトが要る。
GZIP_WINDOW_BITS = zlib.MAX_WBITS | 16
DEFLATE_HEADER_BYTES = 2


class _CompressionDecoder:
    def __init__(self, encoding: str):
        self.encoding = encoding
        self.decompressor = zlib.decompressobj(GZIP_WINDOW_BITS if encoding == "gzip" else zlib.MAX_WBITS)
        self.deflate_prefix = b""
        self.started = False

    def decode(self, content: bytes) -> bytes:
        if not content:
            return b""
        if self.encoding == "deflate" and not self.started:
            # HTTPXは昔の生のDEFLATE形式も受け付ける。先頭の2バイトが届くまで待つ。
            content = self.deflate_prefix + content
            if len(content) < DEFLATE_HEADER_BYTES:
                self.deflate_prefix = content
                return b""
            self.deflate_prefix = b""
            self.started = True
            try:
                first_decoded = self.decompressor.decompress(content)
            except zlib.error:
                self.decompressor = zlib.decompressobj(-zlib.MAX_WBITS)
                first_decoded = self.decompressor.decompress(content)
            if self.decompressor.unused_data:
                raise httpx.DecodingError("Encoded download has unexpected trailing bytes")
            return first_decoded
        decoded = bytearray()
        while content:
            if self.decompressor.eof:
                if self.encoding != "gzip":
                    raise httpx.DecodingError("Encoded download has unexpected trailing bytes")
                # 正しいgzipの本体は、複数のメンバーを連結したものでもよい。
                # どのメンバーのトレーラーも検証する。
                self.decompressor = zlib.decompressobj(GZIP_WINDOW_BITS)
            decoded.extend(self.decompressor.decompress(content))
            content = self.decompressor.unused_data
        return bytes(decoded)

    def finish(self) -> bytes:
        # HTTPX 0.28のgzip・deflateのflushはeofを確かめないので、
        # トレーラーが欠けていても成功に見えることがある。
        if not self.decompressor.eof:
            raise httpx.DecodingError("Encoded download is incomplete")
        return self.decompressor.flush()


async def _decoded_chunks(response: httpx.Response) -> AsyncIterator[tuple[bytes, int]]:
    raw_stream: AsyncIterable[bytes]
    if response.is_stream_consumed:
        # Response(content=...)は本文をデコード済みで、カウンタも
        # リセットしている。そのByteStreamには元のエンコード済みのバイト列が
        # 残っているので、デコード後のサイズを信じずにそれを読み直す。
        if not isinstance(response.stream, httpx.AsyncByteStream):
            raise httpx.DecodingError("Previously consumed download has no async body stream")
        raw_stream = response.stream
    else:
        raw_stream = response.aiter_raw()
    encodings = [
        encoding.strip().lower()
        for encoding in response.headers.get("content-encoding", "").split(",")
        if encoding.strip().lower() not in {"", "identity"}
    ]
    if any(encoding not in {"gzip", "deflate"} for encoding in encodings):
        raise httpx.DecodingError("Unsupported download Content-Encoding")
    decoders = [_CompressionDecoder(encoding) for encoding in reversed(encodings)]
    try:
        async for chunk in raw_stream:
            transfer_bytes = len(chunk)
            for decoder in decoders:
                chunk = decoder.decode(chunk)
            yield chunk, transfer_bytes
        remaining = b""
        for decoder in decoders:
            remaining = decoder.decode(remaining) + decoder.finish()
        if remaining:
            yield remaining, 0
    except zlib.error:
        raise httpx.DecodingError("Encoded download is invalid") from None


async def write_downloaded_content(
    response: httpx.Response, destination: BinaryIO, *, label: str, maximum_bytes: int | None = None
) -> dict[str, Any]:
    if maximum_bytes is not None:
        # 上限のあるコードのアーカイブはidentityを要求する。
        # 想定外のエンコーディングは展開する前に断る。
        encoding = response.headers.get("content-encoding", "identity").strip().lower()
        if encoding not in {"", "identity"}:
            raise ValueError(f"{label} bounded download requires identity encoding")
        declared_size = response.headers.get("content-length")
        if declared_size is not None and declared_size.isdigit() and int(declared_size) > maximum_bytes:
            raise ValueError(f"{label} exceeds its download size limit")
    stream_already_consumed = response.is_stream_consumed
    checksum, stored_size, transfer_bytes = hashlib.sha256(), 0, 0
    async for chunk, received_bytes in _decoded_chunks(response):
        transfer_bytes += received_bytes
        if chunk:
            if maximum_bytes is not None and stored_size + len(chunk) > maximum_bytes:
                raise ValueError(f"{label} exceeds its download size limit")
            destination.write(chunk)
            checksum.update(chunk)
            stored_size += len(chunk)
    if stream_already_consumed and transfer_bytes == 0 and response.content:
        raise httpx.DecodingError("Previously consumed download cannot replay its original body")
    expected_transfer_size = response.headers.get("content-length")
    if expected_transfer_size is not None:
        try:
            transfer_size = int(expected_transfer_size)
        except ValueError:
            raise ApiError(f"{label} download has an invalid Content-Length") from None
        # num_bytes_downloadedは、Content-Encodingをデコードする前の応答本文のバイト数を数える。
        # フレーミングは含まない。
        downloaded_bytes = transfer_bytes if stream_already_consumed else response.num_bytes_downloaded
        if transfer_size < 0 or downloaded_bytes != transfer_size:
            raise ApiError(f"{label} download transfer size mismatch")
    return {"sha256": checksum.hexdigest(), "size": stored_size}
