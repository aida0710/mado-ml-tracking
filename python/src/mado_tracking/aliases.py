"""モデルのaliasの割り当てと削除、追記だけのaliasの履歴。"""

from __future__ import annotations

from collections.abc import Iterator
from typing import TYPE_CHECKING, Any

from .api_paths import path_id
from .errors import ConfigurationError
from .pagination import iterate_listed_items

if TYPE_CHECKING:
    from .client import Client

# GET /models/:id/alias-eventsに合わせる。limitの既定は50で、上限は200。
ALIAS_EVENT_MAX_PAGE_SIZE = 200


def _alias_path(client: Client, project_id: str, model_id: str, alias: str) -> str:
    return client.project_path(project_id, f"models/{path_id(model_id)}/aliases/{path_id(alias)}")


def set_model_alias(
    client: Client,
    project_id: str,
    model_id: str,
    alias: str,
    *,
    version_id: str,
    reason: str = "",
    evaluation_id: str | None = None,
) -> dict[str, Any]:
    """``alias``を``version_id``に向け、登録モデルを返す。

    同じバージョンを割り当て直してもaliasのイベントは増えないので、応答が失われても安全に
    送り直せる。``evaluation_id``は、保護されたaliasの変更を正当化する、合格した昇格の評価を
    指す。指定したときだけ送る。
    """
    body: dict[str, Any] = {"versionId": version_id}
    if reason:
        body["reason"] = reason
    if evaluation_id is not None:
        body["promotionEvaluationId"] = evaluation_id
    return client.request("PUT", _alias_path(client, project_id, model_id, alias), json=body, retryable=True)


def delete_model_alias(
    client: Client, project_id: str, model_id: str, alias: str, *, reason: str = ""
) -> None:
    # 再試行しない。最初の試行で既に消えたaliasの削除を送り直すと404になる。
    client.request(
        "DELETE",
        _alias_path(client, project_id, model_id, alias),
        json={"reason": reason} if reason else None,
    )


def list_alias_events(
    client: Client,
    project_id: str,
    model_id: str,
    *,
    alias: str | None = None,
    page_size: int | None = None,
) -> Iterator[dict[str, Any]]:
    """ModelAliasEventを新しい順に返す。次のページは使う段になって初めてリクエストする。"""
    if page_size is not None and not 1 <= page_size <= ALIAS_EVENT_MAX_PAGE_SIZE:
        raise ConfigurationError(f"page_size must be between 1 and {ALIAS_EVENT_MAX_PAGE_SIZE}")
    path = client.project_path(project_id, f"models/{path_id(model_id)}/alias-events")
    conditions: dict[str, str] = {}
    if alias:
        conditions["alias"] = alias
    if page_size is not None:
        conditions["limit"] = str(page_size)
    return iterate_listed_items(client, path, params=conditions, label="Alias event list")
