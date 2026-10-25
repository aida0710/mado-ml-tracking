"""launcherや`mado-tracking submit`の認証情報を持つファイル。

グループやほかのユーザーが読めるファイルは拒む。中身が既に漏れているかもしれないため。

    token_file             launcherのAPI token（launcher.toml）
    registry_secret_file   JSON {"username", "password"}。runnerがイメージを取ってきてSIFに
                           するときの、レジストリのログイン情報（launcher.toml、または
                           `mado-tracking submit --registry-secret-file`）。runnerには
                           secrets.jsonとして届く
"""

from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any

from ..errors import ConfigurationError

SHARED_PERMISSION_BITS = 0o077


def read_private_text(path: Path, *, label: str) -> str:
    """ファイルの中身の文字列。`label`は、エラーで示すための、パスを与えた設定の名前。"""
    try:
        if os.stat(path).st_mode & SHARED_PERMISSION_BITS:
            raise ConfigurationError(f"{label} {path} must not be readable by group or others")
        return path.read_text(encoding="utf-8")
    except OSError as error:
        raise ConfigurationError(f"{label} {path} could not be read: {error.strerror}") from None


def read_registry_secrets(path: Path, *, label: str) -> dict[str, Any]:
    """runner向けのsecrets.jsonの文書。{"registry": {"username", "password"}}。"""
    text = read_private_text(path, label=label)
    try:
        registry = json.loads(text)
    except ValueError:
        registry = None
    if (
        not isinstance(registry, dict)
        or not isinstance(registry.get("username"), str)
        or not isinstance(registry.get("password"), str)
    ):
        raise ConfigurationError(f"{label} {path} must be JSON with username and password")
    return {"registry": {"username": registry["username"], "password": registry["password"]}}
