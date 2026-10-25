"""手動のフックの開始（payloadはJobにtrigger-payload.jsonとして届く）と、フックの所有者の変更。"""

from __future__ import annotations

import json
import uuid
from collections.abc import Mapping
from typing import TYPE_CHECKING, Any

from .api_paths import path_id
from .errors import ConfigurationError

if TYPE_CHECKING:
    from .client import Client

# HOOK_PAYLOAD_MAX_BYTESに合わせた値。
HOOK_PAYLOAD_MAX_BYTES = 256 * 1024


def trigger_hook(
    client: Client,
    project_id: str,
    hook_id: str,
    payload: Mapping[str, Any] | None = None,
    idempotency_key: str | None = None,
) -> dict[str, Any]:
    """フックを1回開始する。HookExecution（queued、または理由つきのskipped）を返す。

    idempotency keyがあれば、送り直しても最初の開始が見つかる。無ければ乱数のキーを使うので、
    応答が失われたあとの再試行でも、始まるJobは1つだけになる。
    """
    body: dict[str, Any] = {"idempotencyKey": idempotency_key or str(uuid.uuid4())}
    if payload is not None:
        if len(json.dumps(dict(payload), allow_nan=False).encode()) > HOOK_PAYLOAD_MAX_BYTES:
            raise ConfigurationError(f"A hook payload is at most {HOOK_PAYLOAD_MAX_BYTES} bytes of JSON")
        body["payload"] = dict(payload)
    return client.request(
        "POST",
        client.project_path(project_id, f"hooks/{path_id(hook_id)}/trigger"),
        json=body,
        retryable=True,
    )


def transfer_hook_owner(
    client: Client, project_id: str, hook_id: str, *, service_account_id: str
) -> dict[str, Any]:
    """フックをService Accountとして動かし、作成者が抜けてもJobを開始し続けられるようにする。

    そのアカウントは、Projectの有効なeditorかadminである必要がある。``runAsUserId``を含む更新後の
    フックを返す。同じ所有者を設定し直しても何も変わらないので、応答が失われたらPUTを再試行する。
    """
    return client.request(
        "PUT",
        client.project_path(project_id, f"hooks/{path_id(hook_id)}/owner"),
        json={"serviceAccountId": service_account_id},
        retryable=True,
    )
