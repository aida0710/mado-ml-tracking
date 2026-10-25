"""Run.log_audio / log_image / log_video / log_tableに渡すメディアの値と、その保存先。

各値は作られた時点で入力（パス、bytes、numpy配列、PILの画像）をMediaFileに変えるので、不正な
入力は呼び出した場所で失敗する。numpy、Pillow、pandasはメソッドで見分け、importしない。
パスとbytesの入力は、それらが無くても動く。
"""

from __future__ import annotations

import io
import json
import math
import mimetypes
import re
import tempfile
from collections.abc import Iterator, Mapping, Sequence
from contextlib import contextmanager
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, ClassVar, Literal
from uuid import uuid4

from .errors import ConfigurationError
from .media_encoding import (
    EXTENSIONS,
    SIGNATURE_BYTES,
    encode_png,
    encode_wav,
    is_array,
    sniff_mime_type,
)

__all__ = ["Audio", "Image", "MediaKind", "Table", "Video", "artifact_reference"]

MediaKind = Literal["audio", "image", "video", "table"]
# APIのRunMedia.key。制御文字を含まない1〜250文字。
MEDIA_KEY_MAX_LENGTH = 250
MEDIA_ROOT = "media"
TABLE_MIME_TYPE = "application/json"
# PNGがそのまま保存できるPillowのモード。ほか（CMYK、YCbCr、...）はRGBAに変換する。
PNG_PIL_MODES = {"1", "L", "LA", "I", "I;16", "P", "RGB", "RGBA"}
UNSAFE_KEY_CHARACTERS = re.compile(r"[\\\x00-\x1f\x7f]|%[0-9a-fA-F]{2}")


@dataclass(frozen=True)
class MediaFile:
    """Artifactとして保存する1つのファイル。既存のパスか、エンコード済みの内容。"""

    mime_type: str
    extension: str
    metadata: dict[str, Any] = field(default_factory=dict)
    path: Path | None = None
    content: bytes | None = None

    @contextmanager
    def local_path(self) -> Iterator[Path]:
        """ファイルを読むためのパス。内容は、使っている間だけ一時ファイルに書き出す。"""
        if self.path is not None:
            yield self.path
            return
        with tempfile.TemporaryDirectory(prefix="mado-tracking-media-") as directory:
            path = Path(directory) / f"media.{self.extension}"
            path.write_bytes(self.content or b"")
            yield path


class MediaValue:
    """音声・画像・動画の値。Runがそのファイルを保存し、メディアとして登録する。"""

    kind: ClassVar[MediaKind]

    def __init__(self, file: MediaFile, caption: str | None):
        self.file = file
        self.caption = caption


class Audio(MediaValue):
    """パス、bytes（WAV/FLAC/MP3/OGG/M4A）、またはnumpy配列（[-1, 1]のfloatかint16、モノラルか
    ステレオで(frames,) / (frames, channels)）。配列にはsample_rateが要り、16ビットのWAVになる。"""

    kind = "audio"

    def __init__(self, data: Any, *, sample_rate: int | None = None, caption: str | None = None):
        if is_array(data):
            if sample_rate is None:
                raise ConfigurationError("sample_rate is required to log an audio array")
            encoded = encode_wav(data, sample_rate=sample_rate)
            file = MediaFile(encoded.mime_type, "wav", encoded.metadata, content=encoded.content)
        else:
            file = file_from_source(data, kind="audio")
        super().__init__(file, caption)


class Image(MediaValue):
    """パス、bytes、PIL.Image、またはnumpy配列（HxW / HxWx3 / HxWx4。uint8か、[0, 1]のfloat）。"""

    kind = "image"

    def __init__(self, image: Any, *, caption: str | None = None):
        if is_array(image):
            encoded = encode_png(image)
            file = MediaFile(encoded.mime_type, "png", encoded.metadata, content=encoded.content)
        elif is_pil_image(image):
            file = png_from_pil(image)
        else:
            file = file_from_source(image, kind="image")
        super().__init__(file, caption)


class Video(MediaValue):
    """エンコード済みの動画のパスかbytes。mp4（H.264）かwebmなら、どのブラウザでも再生できる。"""

    kind = "video"

    def __init__(self, video: Any, *, caption: str | None = None):
        super().__init__(file_from_source(video, kind="video"), caption)


class Table:
    """名前つきの列の下に並ぶ、セルの行。Audio/Image/Videoのセルはそれぞれ別のArtifactとして
    保存する。文字列``mmt-artifact://runs/<runId>/<path>``（artifact_referenceを参照）は、別の
    RunのArtifactを指す。"""

    def __init__(self, columns: Sequence[str], rows: Sequence[Sequence[Any]]):
        self.columns = [str(column) for column in columns]
        self.rows = [list(row) for row in rows]
        for index, row in enumerate(self.rows):
            if len(row) != len(self.columns):
                raise ConfigurationError(
                    f"Table row {index} has {len(row)} cells for {len(self.columns)} columns"
                )

    @classmethod
    def from_value(cls, table: Any) -> Table:
        """Table、{columns, data}のmapping（MLflowのsplit形式のJSON）、またはpandas.DataFrame。"""
        if isinstance(table, Table):
            return table
        if isinstance(table, Mapping) and "columns" in table and "data" in table:
            return cls(table["columns"], table["data"])
        if hasattr(table, "to_dict") and hasattr(table, "columns"):
            split = table.to_dict(orient="split")
            return cls(split["columns"], split["data"])
        raise ConfigurationError("log_table needs a Table, a {columns, data} mapping or a pandas.DataFrame")

    def media_cells(self) -> list[tuple[int, int, MediaValue]]:
        """Audio/Image/Videoのセルすべての(row, column, value)。"""
        return [
            (row_index, column_index, cell)
            for row_index, row in enumerate(self.rows)
            for column_index, cell in enumerate(row)
            if isinstance(cell, MediaValue)
        ]

    def split_json(self, stored_cells: Mapping[tuple[int, int], dict[str, str]]) -> bytes:
        """MLflowのorient='split'のJSON。メディアのセルは、保存した{type, filepath}に置き換える。"""
        data = [
            [
                stored_cells[(row_index, column_index)]
                if (row_index, column_index) in stored_cells
                else json_cell(cell)
                for column_index, cell in enumerate(row)
            ]
            for row_index, row in enumerate(self.rows)
        ]
        try:
            return json.dumps(
                {"columns": self.columns, "data": data},
                ensure_ascii=False,
                allow_nan=False,
                default=json_cell_fallback,
            ).encode()
        except (TypeError, ValueError) as error:
            raise ConfigurationError(f"The table cannot be saved as JSON: {error}") from error


def artifact_reference(run_id: str, path: str) -> str:
    """同じProjectの別のRunのArtifactを指す、表のセル。"""
    return f"mmt-artifact://runs/{run_id}/{path.lstrip('/')}"


def media_artifact_path(key: str, step: int, extension: str) -> str:
    """media/<key>/step-<step>/<uuid>.<ext>。keyの'/'は、Artifactブラウザでディレクトリになる。"""
    validate_media_key(key)
    return f"{MEDIA_ROOT}/{key}/step-{step}/{uuid4()}.{extension}"


def validate_media_key(key: str) -> None:
    if not isinstance(key, str) or not 1 <= len(key) <= MEDIA_KEY_MAX_LENGTH:
        raise ConfigurationError(f"A media key must be 1-{MEDIA_KEY_MAX_LENGTH} characters")
    if UNSAFE_KEY_CHARACTERS.search(key) or any(segment in {"", ".", ".."} for segment in key.split("/")):
        raise ConfigurationError(
            f"Media key {key!r} must be a relative path without empty, '.' or '..' segments, "
            "backslashes, control characters or %xx escapes"
        )


def validate_step(step: int) -> int:
    if isinstance(step, bool) or not isinstance(step, int) or step < 0:
        raise ConfigurationError("A media step must be a non-negative integer")
    return step


def file_from_source(source: Any, *, kind: MediaKind) -> MediaFile:
    """パスかbytesのMediaFile。種類はファイルの拡張子で、無ければ先頭のバイト列で決める。"""
    if isinstance(source, (bytes, bytearray, memoryview)):
        content = bytes(source)
        mime_type = sniff_mime_type(content[:SIGNATURE_BYTES])
        if mime_type is None:
            raise ConfigurationError(f"Cannot tell the {kind} format of these bytes; log a file path instead")
        check_kind(mime_type, kind)
        return MediaFile(mime_type, EXTENSIONS[mime_type], content=content)
    if not isinstance(source, (str, Path)):
        raise ConfigurationError(f"Cannot log {type(source).__name__} as {kind}")
    path = Path(source)
    if not path.is_file():
        raise ConfigurationError(f"{kind} file {path} does not exist")
    mime_type = mimetypes.guess_type(path.name)[0]
    if mime_type is None or not mime_type.startswith(f"{kind}/"):
        with path.open("rb") as stream:
            mime_type = sniff_mime_type(stream.read(SIGNATURE_BYTES)) or mime_type
    if mime_type is None:
        raise ConfigurationError(f"Cannot tell the {kind} format of {path}")
    check_kind(mime_type, kind)
    extension = path.suffix.lstrip(".").lower() or EXTENSIONS.get(mime_type, "bin")
    return MediaFile(mime_type, extension, path=path)


def check_kind(mime_type: str, kind: MediaKind) -> None:
    # APIはimageとして登録されたaudio/*のArtifactを拒む（media_kind_mismatch）。先に失敗させる。
    if not mime_type.startswith(f"{kind}/"):
        raise ConfigurationError(f"A {mime_type} file cannot be logged as {kind}")


def is_pil_image(value: object) -> bool:
    return all(hasattr(value, name) for name in ("save", "mode", "size", "convert"))


def png_from_pil(image: Any) -> MediaFile:
    if image.mode not in PNG_PIL_MODES:
        image = image.convert("RGBA")
    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    width, height = image.size
    return MediaFile("image/png", "png", {"width": width, "height": height}, content=buffer.getvalue())


def json_cell(cell: Any) -> Any:
    """NaNと無限大はnullにする。pandasのto_jsonと同じ書き方。"""
    if isinstance(cell, float) and not math.isfinite(cell):
        return None
    return cell


def json_cell_fallback(cell: Any) -> Any:
    """jsonが自分では変換できない、numpyのスカラーと配列（item / tolist）。"""
    if hasattr(cell, "item") and getattr(cell, "shape", None) == ():
        return json_cell(cell.item())
    if hasattr(cell, "tolist"):
        return cell.tolist()
    raise TypeError(f"Table cell of type {type(cell).__name__} is not JSON serializable")
