"""Rules for text a worker reports to the API about itself or a computer: paths and names.

The API validates every reported string (apps/api/src/domain/targetCheckValidation.ts and
reportedPathValidation.ts) and refuses a whole result for one bad string, so the worker drops such
a string first instead of losing the result.
"""

from __future__ import annotations

import json
import re
from typing import Any

from ..security import SecretMasker

CONTROL_CHARACTERS = re.compile(r"[\x00-\x1f\x7f]")
# MAX_TARGET_PATH_LENGTH of the contract: paths a person types for a computer and paths a worker reports.
MAX_TARGET_PATH_LENGTH = 1024
# API は、API token（mado_mt_）・Job token（mado_mtj_）や PEM の秘密鍵を含む結果を断る。
# 単語の境界は API の JavaScript の正規表現と同じく ASCII で見る。
API_SECRET_PATTERNS = (
    re.compile(r"\bmado_mtj?_[A-Za-z0-9_-]{8,}", re.ASCII),
    re.compile(r"-----BEGIN [A-Z ]*PRIVATE KEY-----"),
)


def javascript_length(text: str) -> int:
    """The length the API's zod limits count: UTF-16 code units, two for a character beyond the BMP."""
    return len(text.encode("utf-16-le")) // 2


def is_one_line_path(path: str) -> bool:
    return 0 < javascript_length(path) <= MAX_TARGET_PATH_LENGTH and not CONTROL_CHARACTERS.search(path)


def looks_like_secret(text: str, *, masker: SecretMasker) -> bool:
    """A configured secret (the worker's token) or what the API takes for a token or private key."""
    return masker.mask(text) != text or any(pattern.search(text) for pattern in API_SECRET_PATTERNS)


def json_size(value: Any) -> int:
    """Bytes of `value` as the API measures it: Buffer.byteLength(JSON.stringify(value))."""
    return len(json.dumps(value, ensure_ascii=False, separators=(",", ":")).encode())
