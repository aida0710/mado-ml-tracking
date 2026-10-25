"""データセットバージョンを登録したあとに足す、確認済みの親の来歴。"""

from __future__ import annotations

import json
from collections.abc import Mapping, Sequence
from typing import TYPE_CHECKING, Any

from .errors import ConfigurationError

if TYPE_CHECKING:
    from .client import Client


def add_dataset_version_parents(
    client: Client,
    project_id: str,
    dataset_id: str,
    version_id: str,
    *,
    parent_dataset_version_ids: Sequence[str],
    reason: str,
    evidence: Mapping[str, Any],
) -> dict[str, Any]:
    """バージョンの中身や学習での参照を変えずに、確認済みの出どころを足す。

    同じ親をもう一度指定すると、最初の理由・根拠・作成者を返す。これは来歴の訂正を記録するもので、
    学習のRunで使ったデータを変えるものではない。
    """
    from .client import path_id

    parents = list(parent_dataset_version_ids)
    if not parents or len(set(parents)) != len(parents):
        raise ConfigurationError("List at least one parent version, without duplicates")
    if not reason.strip() or not evidence:
        raise ConfigurationError("A reason and comparison evidence are required")
    body = {"parentDatasetVersionIds": parents, "reason": reason.strip(), "evidence": dict(evidence)}
    try:
        json.dumps(body, allow_nan=False)
    except (ValueError, TypeError) as error:
        raise ConfigurationError("Parent comparison evidence requires finite JSON values") from error
    return client.request(
        "POST",
        client.project_path(
            project_id, f"datasets/{path_id(dataset_id)}/versions/{path_id(version_id)}/parents"
        ),
        retryable=True,
        json=body,
    )


def dataset_version_parents(
    client: Client, project_id: str, dataset_id: str, version_id: str
) -> dict[str, Any]:
    """登録された親と、追記だけの過去の来歴を読む。"""
    from .client import path_id

    return client.request(
        "GET",
        client.project_path(
            project_id, f"datasets/{path_id(dataset_id)}/versions/{path_id(version_id)}/parents"
        ),
        retryable=True,
    )
