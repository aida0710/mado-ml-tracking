"""ProjectのService Accountと、ProjectのAPI tokenの一覧（Project adminの操作）。"""

from __future__ import annotations

from collections.abc import Sequence
from datetime import UTC, datetime
from typing import TYPE_CHECKING, Any

from .api_paths import path_id
from .errors import ConfigurationError

if TYPE_CHECKING:
    from .client import Client

SERVICE_ACCOUNT_ROLES = {"viewer", "editor", "admin"}


def list_service_accounts(client: Client, project_id: str) -> list[dict[str, Any]]:
    return client.list_project_items(project_id, "service-accounts")


def create_service_account(
    client: Client, project_id: str, *, name: str, role: str, description: str = ""
) -> dict[str, Any]:
    """Service Accountを作る。人ではなく、Projectに属するアカウント。"""
    if role not in SERVICE_ACCOUNT_ROLES:
        raise ConfigurationError("role must be viewer, editor or admin")
    # 再試行しない。作成を送り直すと、2つ目のアカウントができる。
    return client.request(
        "POST",
        client.project_path(project_id, "service-accounts"),
        json={"name": name, "description": description, "role": role},
    )


def create_service_account_token(
    client: Client,
    project_id: str,
    service_account_id: str,
    *,
    name: str,
    scopes: Sequence[str],
    expires_at: datetime | None = None,
) -> dict[str, Any]:
    """Service Accountが所有するAPI tokenを発行し、``{token, item}``を返す。

    tokenの値を返すのはこの呼び出しだけ。scopeはアカウントのroleを超えられない。
    ``expires_at``が無ければ、APIは有効期間の上限（既定は365日）を使う。
    """
    if isinstance(scopes, str) or not scopes:
        raise ConfigurationError("scopes must be a non-empty sequence of strings")
    body: dict[str, Any] = {"name": name, "scopes": list(scopes)}
    if expires_at is not None:
        # タイムゾーンの無いdatetimeは時刻が定まらず、期限がホストの時計のタイムゾーン次第になる。
        if expires_at.tzinfo is None:
            raise ConfigurationError("expires_at must be timezone-aware")
        body["expiresAt"] = expires_at.astimezone(UTC).isoformat().replace("+00:00", "Z")
    # 再試行しない。応答が失われたあとに送り直すと、値を誰も見ていないtokenが残ったまま
    # 2つ目ができる。
    return client.request(
        "POST",
        client.project_path(project_id, f"service-accounts/{path_id(service_account_id)}/tokens"),
        json=body,
    )


def list_project_tokens(client: Client, project_id: str) -> list[dict[str, Any]]:
    """Projectの個人のtokenとService Accountのtokenのすべて。tokenの値は含まない。"""
    return client.list_project_items(project_id, "tokens")
