"""Runの検索と、検索結果のCSVエクスポートで共有するRunSearchRequestの本文を組み立てる。"""

from __future__ import annotations

from collections.abc import Sequence
from typing import Any

from .errors import ConfigurationError


def build_run_search_body(
    *,
    filter: str | None = None,
    order_by: Sequence[str] = (),
    experiment_ids: Sequence[str] = (),
    kinds: Sequence[str] = (),
    statuses: Sequence[str] = (),
    model_version_ids: Sequence[str] = (),
    input_dataset_version_ids: Sequence[str] = (),
    parent_run_id: str | None = None,
    name: str | None = None,
) -> dict[str, Any]:
    """SDKのキーワード引数をAPIのフィールド名に対応させる。設定されていない条件は含めない。

    ``filter``と``order_by``はMLflowの検索構文を使う。空のリストはAPIでも検索を絞らないので、
    省いてもリクエストの意味は変わらない。
    """
    list_conditions = {
        "orderBy": order_by,
        "experimentIds": experiment_ids,
        "kinds": kinds,
        "statuses": statuses,
        "modelVersionIds": model_version_ids,
        "inputDatasetVersionIds": input_dataset_version_ids,
    }
    # ただの文字列もSequenceなので、そのまま回すと1文字ごとに1つの条件を送ってしまう。
    if any(isinstance(values, str) for values in list_conditions.values()):
        raise ConfigurationError(
            "order_by, experiment_ids, kinds, statuses, model_version_ids and "
            "input_dataset_version_ids must be sequences of strings"
        )
    body: dict[str, Any] = {key: list(values) for key, values in list_conditions.items() if values}
    if filter:
        body["filter"] = filter
    if parent_run_id:
        body["parentRunId"] = parent_run_id
    if name:
        body["name"] = name
    return body
