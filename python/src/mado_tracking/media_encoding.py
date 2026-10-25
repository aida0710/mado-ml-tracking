"""メディアのファイル形式。numpy風の配列のWAV/PNGへのエンコードと、先頭のバイト列による判別。

標準ライブラリだけを使う。配列は自身のメソッド（``dtype``、``shape``、``clip``、``astype``、
``tobytes``）で扱うので、ここでnumpyはimportしない。
"""

from __future__ import annotations

import io
import struct
import wave
import zlib
from dataclasses import dataclass
from typing import Any

from .errors import ConfigurationError

PCM16_MAX = 32767
PIXEL_MAX = 255
# WAVは画面の音声ビューアーと同じく、1チャンネル（モノラル）か2チャンネル（ステレオ）を扱う。
MAX_AUDIO_CHANNELS = 2
PNG_SIGNATURE = b"\x89PNG\r\n\x1a\n"
# 8ビットのグレースケール、RGB、RGBAに当たるPNGのcolor type（PNGの仕様、IHDR）。
PNG_COLOR_TYPES = {1: 0, 3: 2, 4: 6}
# FILE_SIGNATURESのどの形式も見分けられるだけの、ファイルの先頭の長さ。
SIGNATURE_BYTES = 16


@dataclass(frozen=True)
class EncodedMedia:
    content: bytes
    mime_type: str
    metadata: dict[str, Any]


def is_array(value: object) -> bool:
    """numpy配列か、それと同じ作りのもの。numpyをimportせずに見分ける。"""
    return hasattr(value, "dtype") and hasattr(value, "shape") and hasattr(value, "astype")


def encode_wav(samples: Any, *, sample_rate: int) -> EncodedMedia:
    """int16の配列か、[-1, 1]のfloatの配列から作る16ビットPCMのWAV（範囲外の値は切り詰める）。

    配列は、モノラルなら(frames,)、モノラル・ステレオなら(frames, channels)。
    """
    if isinstance(sample_rate, bool) or not isinstance(sample_rate, int) or sample_rate <= 0:
        raise ConfigurationError("sample_rate must be a positive integer for an audio array")
    shape = tuple(samples.shape)
    if len(shape) == 1:
        channels = 1
    elif len(shape) == 2 and 1 <= shape[1] <= MAX_AUDIO_CHANNELS:
        channels = shape[1]
    else:
        raise ConfigurationError(
            f"An audio array must be (frames,) or (frames, channels) with 1-2 channels, not {shape}; "
            "transpose a (channels, frames) array first"
        )
    kind = samples.dtype.kind
    if kind == "f":
        samples = (samples.clip(-1.0, 1.0) * PCM16_MAX).round()
    elif str(samples.dtype) != "int16":
        raise ConfigurationError(f"An audio array must be float or int16, not {samples.dtype}")
    frames = samples.astype("<i2").tobytes()
    buffer = io.BytesIO()
    with wave.open(buffer, "wb") as writer:
        writer.setnchannels(channels)
        writer.setsampwidth(2)
        writer.setframerate(sample_rate)
        writer.writeframes(frames)
    return EncodedMedia(buffer.getvalue(), "audio/wav", {"sampleRate": sample_rate, "channels": channels})


def encode_png(pixels: Any) -> EncodedMedia:
    """uint8の配列か、[0, 1]のfloatの配列から作る8ビットのPNG（範囲外の値は切り詰める）。

    配列はHxW（グレースケール）、HxWx1、HxWx3（RGB）、HxWx4（RGBA）のいずれか。
    """
    shape = tuple(pixels.shape)
    if len(shape) == 2:
        height, width, channels = shape[0], shape[1], 1
    elif len(shape) == 3 and shape[2] in PNG_COLOR_TYPES:
        height, width, channels = shape
    else:
        raise ConfigurationError(f"An image array must be HxW, HxWx1, HxWx3 or HxWx4, not {shape}")
    if height == 0 or width == 0:
        raise ConfigurationError("An image array must not be empty")
    kind = pixels.dtype.kind
    if kind == "f":
        pixels = (pixels.clip(0.0, 1.0) * PIXEL_MAX).round()
    elif str(pixels.dtype) != "uint8":
        raise ConfigurationError(f"An image array must be uint8 or float, not {pixels.dtype}")
    content = png_bytes(
        pixels.astype("u1").tobytes(), width=width, height=height, color_type=PNG_COLOR_TYPES[channels]
    )
    return EncodedMedia(content, "image/png", {"width": width, "height": height})


def png_bytes(raw_pixels: bytes, *, width: int, height: int, color_type: int) -> bytes:
    """最小限のPNG。IHDR、全行にフィルタ0をかけてzlibで圧縮した1つのIDAT、IEND。"""
    row_bytes = len(raw_pixels) // height
    scanlines = b"".join(
        b"\x00" + raw_pixels[row * row_bytes : (row + 1) * row_bytes] for row in range(height)
    )
    header = struct.pack(">IIBBBBB", width, height, 8, color_type, 0, 0, 0)
    return (
        PNG_SIGNATURE
        + png_chunk(b"IHDR", header)
        + png_chunk(b"IDAT", zlib.compress(scanlines))
        + png_chunk(b"IEND", b"")
    )


def png_chunk(chunk_type: bytes, body: bytes) -> bytes:
    crc = zlib.crc32(chunk_type + body) & 0xFFFFFFFF
    return struct.pack(">I", len(body)) + chunk_type + body + struct.pack(">I", crc)


FILE_SIGNATURES: tuple[tuple[bytes, str], ...] = (
    (b"fLaC", "audio/flac"),
    (b"ID3", "audio/mpeg"),
    (b"OggS", "audio/ogg"),
    (PNG_SIGNATURE, "image/png"),
    (b"\xff\xd8\xff", "image/jpeg"),
    (b"GIF87a", "image/gif"),
    (b"GIF89a", "image/gif"),
    (b"BM", "image/bmp"),
    # MatroskaとWebMは同じEBMLヘッダーを持つ。ブラウザはどちらもWebMとして再生する。
    (b"\x1a\x45\xdf\xa3", "video/webm"),
)


def sniff_mime_type(head: bytes) -> str | None:
    """先頭のSIGNATURE_BYTESバイトから判別した、音声・画像・動画ファイルのMIMEタイプ。"""
    if head.startswith(b"RIFF") and head[8:12] == b"WAVE":
        return "audio/wav"
    if head.startswith(b"RIFF") and head[8:12] == b"WEBP":
        return "image/webp"
    if head[4:8] == b"ftyp":
        brand = head[8:12]
        if brand.startswith(b"M4A"):
            return "audio/mp4"
        return "video/quicktime" if brand == b"qt  " else "video/mp4"
    for signature, mime_type in FILE_SIGNATURES:
        if head.startswith(signature):
            return mime_type
    # ID3タグの無いMP3は、MPEGオーディオのフレーム同期から始まる。
    if len(head) >= 2 and head[0] == 0xFF and head[1] & 0xE0 == 0xE0:
        return "audio/mpeg"
    return None


# MIMEタイプごとに保存するファイルの拡張子。画面はメディアの種類を拡張子で見分ける。
EXTENSIONS = {
    "audio/wav": "wav",
    "audio/x-wav": "wav",
    "audio/flac": "flac",
    "audio/mpeg": "mp3",
    "audio/ogg": "ogg",
    "audio/opus": "opus",
    "audio/mp4": "m4a",
    "audio/aac": "aac",
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/gif": "gif",
    "image/webp": "webp",
    "image/bmp": "bmp",
    "video/mp4": "mp4",
    "video/webm": "webm",
    "video/quicktime": "mov",
    "video/x-matroska": "mkv",
    "application/json": "json",
}
