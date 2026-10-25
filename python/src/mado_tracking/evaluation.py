"""ベースラインのバージョンに対する評価結果、昇格ポリシーとその判定。"""

from __future__ import annotations

from collections.abc import Iterator, Mapping, Sequence
from typing import TYPE_CHECKING, Any

from .api_paths import path_id
from .errors import ConfigurationError
from .pagination import iterate_listed_items

if TYPE_CHECKING:
    from .client import Client
    from .run import Run

# GET /promotion-evaluationsに合わせる。limitの既定は50で、上限は200。
PROMOTION_EVALUATION_MAX_PAGE_SIZE = 200
PROMOTION_CRITERION_FIELDS = {"metric", "direction", "mode", "threshold"}


def reference_dataset_version_ids(run: Run | Mapping[str, Any]) -> list[str]:
    """Runの正解データ（ground truth）のDatasetVersion。入力の順に並ぶ。

    正解セットは``inputDatasetVersionIds``から``upstreamDatasetVersionIds``を除いたもの。連鎖した
    評価のRunは、上流のRunの出力（例えば推論の結果）も入力として受け取るため。
    """
    entity = run if isinstance(run, Mapping) else run.entity
    inputs = entity.get("inputDatasetVersionIds") or []
    upstream = set(entity.get("upstreamDatasetVersionIds") or [])
    return [version_id for version_id in inputs if version_id not in upstream]


def compare_to_baseline(
    client: Client,
    project_id: str,
    model_id: str,
    candidate_version_id: str,
    *,
    baseline_alias: str | None = None,
    baseline_version_id: str | None = None,
    reference_dataset_version_ids: Sequence[str] | None = None,
    code_version_id: str | None = None,
    evaluation_rule_id: str | None = None,
    metrics: Sequence[str] | None = None,
) -> dict[str, Any]:
    """候補のバージョンとそのベースラインを比べたEvaluationComparisonを返す。

    ベースラインを指定しなければ、APIは``production``のaliasと比べる。比べられないときは例外にせず、
    ``status``で知らせる（例えば``baseline_missing``）。
    ``reference_dataset_version_ids=[]``は、Noneと違って明示的な空の集合として送る。
    """
    if baseline_alias is not None and baseline_version_id is not None:
        raise ConfigurationError("Specify either baseline_alias or baseline_version_id, not both")
    if isinstance(reference_dataset_version_ids, str) or isinstance(metrics, str):
        raise ConfigurationError("reference_dataset_version_ids and metrics must be sequences of strings")
    params: dict[str, str] = {}
    optional_values = {
        "baselineAlias": baseline_alias,
        "baselineVersionId": baseline_version_id,
        "codeVersionId": code_version_id,
        "evaluationRuleId": evaluation_rule_id,
    }
    params.update({key: value for key, value in optional_values.items() if value is not None})
    # APIは一覧をカンマ区切りで読む。値が空でも指定があれば空の一覧を意味する。
    if reference_dataset_version_ids is not None:
        params["referenceDatasetVersionIds"] = ",".join(reference_dataset_version_ids)
    if metrics is not None:
        params["metrics"] = ",".join(metrics)
    path = client.project_path(
        project_id,
        f"models/{path_id(model_id)}/versions/{path_id(candidate_version_id)}/evaluation-comparison",
    )
    return client.request("GET", path, params=params, retryable=True)


def create_promotion_policy(
    client: Client,
    project_id: str,
    *,
    name: str,
    model_id: str,
    target_alias: str,
    evaluation_rule_id: str,
    criteria: Sequence[Mapping[str, Any]],
    baseline_alias: str | None = None,
    missing_baseline: str | None = None,
    auto_promote: bool | None = None,
    enabled: bool = True,
) -> dict[str, Any]:
    """PromotionPolicyを作る。省いたオプションはAPIの既定値になる。

    各条件は``{"metric", "direction": "higher"|"lower",
    "mode": "absolute"|"delta"|"relative_delta", "threshold"}``。
    """
    if not criteria or any(set(criterion) != PROMOTION_CRITERION_FIELDS for criterion in criteria):
        raise ConfigurationError(
            "criteria needs at least one entry with exactly metric, direction, mode and threshold"
        )
    body: dict[str, Any] = {
        "name": name,
        "modelId": model_id,
        "targetAlias": target_alias,
        "evaluationRuleId": evaluation_rule_id,
        "criteria": [dict(criterion) for criterion in criteria],
        "enabled": enabled,
    }
    optional_values = {
        "baselineAlias": baseline_alias,
        "missingBaseline": missing_baseline,
        "autoPromote": auto_promote,
    }
    body.update({key: value for key, value in optional_values.items() if value is not None})
    # 再試行しない。作成を送り直すと2つ目のポリシーができてしまう。
    return client.request("POST", client.project_path(project_id, "promotion-policies"), json=body)


def list_promotion_policies(
    client: Client, project_id: str, *, model_id: str | None = None
) -> list[dict[str, Any]]:
    return client.list_project_items(
        project_id, "promotion-policies", params={"modelId": model_id} if model_id else None
    )


def list_promotion_evaluations(
    client: Client,
    project_id: str,
    *,
    model_id: str | None = None,
    policy_id: str | None = None,
    candidate_version_id: str | None = None,
    page_size: int | None = None,
) -> Iterator[dict[str, Any]]:
    """PromotionEvaluationを新しい順に返す。次のページは使う段になって初めてリクエストする。"""
    if page_size is not None and not 1 <= page_size <= PROMOTION_EVALUATION_MAX_PAGE_SIZE:
        raise ConfigurationError(f"page_size must be between 1 and {PROMOTION_EVALUATION_MAX_PAGE_SIZE}")
    optional_values = {
        "modelId": model_id,
        "policyId": policy_id,
        "candidateVersionId": candidate_version_id,
        "limit": str(page_size) if page_size is not None else None,
    }
    conditions = {key: value for key, value in optional_values.items() if value is not None}
    path = client.project_path(project_id, "promotion-evaluations")
    return iterate_listed_items(client, path, params=conditions, label="Promotion evaluation list")


def transfer_promotion_policy_owner(
    client: Client, project_id: str, policy_id: str, *, service_account_id: str
) -> dict[str, Any]:
    """ポリシーをService Accountとして動かし、作成者がいなくなっても動き続けるようにする。

    ``runAsUserId``を持つ更新後のポリシーを返す。同じ所有者を設定し直しても何も変わらないので、
    応答が失われたらPUTを再試行する。
    """
    return client.request(
        "PUT",
        client.project_path(project_id, f"promotion-policies/{path_id(policy_id)}/owner"),
        json={"serviceAccountId": service_account_id},
        retryable=True,
    )
