"""公開の/api契約で使うパスの要素。"""

from __future__ import annotations

from urllib.parse import quote

from .errors import ConfigurationError


def path_id(identifier: str) -> str:
    """エンティティのIDを1つのパスの要素としてエスケープし、IDでパスの階層が増えないようにする。"""
    if not identifier:
        raise ConfigurationError("An entity ID is required")
    return quote(identifier, safe="")
