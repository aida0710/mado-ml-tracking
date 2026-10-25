"""workerが自分自身やコンピュータについてAPIに報告する文字列（パスと名前）の規則。

APIは報告された文字列をすべて検証し（apps/api/src/domain/targetCheckValidation.tsと
reportedPathValidation.ts）、不正な文字列が1つあるだけで結果全体を断る。
そのためworkerは、結果を失わないよう、そのような文字列を先に取り除く。
"""

from __future__ import annotations

import json
import re
from typing import Any

from ..security import SecretMasker

CONTROL_CHARACTERS = re.compile(r"[\x00-\x1f\x7f]")
# 契約のMAX_TARGET_PATH_LENGTH: 人がコンピュータ用に入力するパスと、workerが報告するパスの上限。
MAX_TARGET_PATH_LENGTH = 1024
# API は、API token（mado_mt_）・Job token（mado_mtj_）や PEM の秘密鍵を含む結果を断る。
# 単語の境界は API の JavaScript の正規表現と同じく ASCII で見る。
API_SECRET_PATTERNS = (
    re.compile(r"\bmado_mtj?_[A-Za-z0-9_-]{8,}", re.ASCII),
    re.compile(r"-----BEGIN [A-Z ]*PRIVATE KEY-----"),
)


def javascript_length(text: str) -> int:
    """APIのzodの上限が数える長さ。UTF-16のコード単位で、BMPの外の文字は2と数える。"""
    return len(text.encode("utf-16-le")) // 2


def is_one_line_path(path: str) -> bool:
    return 0 < javascript_length(path) <= MAX_TARGET_PATH_LENGTH and not CONTROL_CHARACTERS.search(path)


def looks_like_secret(text: str, *, masker: SecretMasker) -> bool:
    """設定された秘密情報（workerのtoken）、またはAPIがtokenや秘密鍵とみなすもの。"""
    return masker.mask(text) != text or any(pattern.search(text) for pattern in API_SECRET_PATTERNS)


def json_size(value: Any) -> int:
    """APIが測るときの`value`のバイト数: Buffer.byteLength(JSON.stringify(value))。"""
    return len(json.dumps(value, ensure_ascii=False, separators=(",", ":")).encode())
