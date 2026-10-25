"""検証済みの学習の来歴を、既存のモデルバージョンに付ける。"""

from __future__ import annotations

import json
from collections.abc import Mapping
from typing import TYPE_CHECKING, Any

from .errors import ConfigurationError

if TYPE_CHECKING:
    from .client import Client


def associate_model_training_source(
    client: Client,
    project_id: str,
    model_id: str,
    version_id: str,
    *,
    run_id: str | None = None,
    historical_run: Mapping[str, Any] | None = None,
    evidence: Mapping[str, Any] | None = None,
) -> dict[str, Any]:
    """完了したRunを紐付ける。または、完了した過去の学習を記録して紐付けるまでを不可分に行う。

    historical_runはネイティブAPIのフィールド名で書き、inputDatasetVersionIdsも正確に入れる。
    分からないstartedAt/endedAtは省く。重みと既存のバージョンIDは変わらない。
    """
    from .client import path_id

    if (run_id is None) == (historical_run is None):
        raise ConfigurationError("Specify exactly one of run_id or historical_run")
    body: dict[str, Any] = {"evidence": dict(evidence or {})}
    if run_id is not None:
        body["runId"] = run_id
    else:
        body["run"] = dict(historical_run or {})
    try:
        json.dumps(body, allow_nan=False)
    except (ValueError, TypeError) as error:
        raise ConfigurationError("Training provenance requires finite JSON values") from error
    return client.request(
        "POST",
        client.project_path(
            project_id, f"models/{path_id(model_id)}/versions/{path_id(version_id)}/training-source"
        ),
        retryable=True,
        json=body,
    )
