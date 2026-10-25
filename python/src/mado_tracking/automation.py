"""自動実行ルール（登録や上流のRunの後に行う推論・評価・処理）。"""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from typing import TYPE_CHECKING, Any

from .api_paths import path_id
from .errors import ConfigurationError
from .pagination import iterate_listed_items

if TYPE_CHECKING:
    from .client import Client

AUTOMATION_RULE_KINDS = {"inference", "evaluation", "processing"}
AUTOMATION_TRIGGERS = {"model_registered", "upstream_run_finished"}


def create_automation_rule(
    client: Client,
    project_id: str,
    *,
    name: str,
    model_families: Sequence[str],
    kind: str,
    experiment_id: str,
    code_version_id: str,
    target_id: str,
    trigger: str = "model_registered",
    upstream_rule_id: str | None = None,
    summary_metrics: Sequence[str] = (),
    gpu_ids: Sequence[str] = (),
    input_dataset_version_ids: Sequence[str] = (),
    parameters: Mapping[str, Any] | None = None,
    tags: Mapping[str, str] | None = None,
    max_attempts: int = 1,
    enabled: bool = True,
) -> dict[str, Any]:
    """ルールを作る。設定はあとから変えられず、変えられるのは``enabled``だけ。

    ``trigger="upstream_run_finished"``は、ルールを``upstream_rule_id``の後ろにつなぐ。そのルールの
    Runが出力DatasetVersionを持って終わると始まる。``summary_metrics``は、モデルバージョンの
    評価結果で最初に並べるメトリクスの名前。
    """
    if kind not in AUTOMATION_RULE_KINDS:
        raise ConfigurationError("Automation supports inference, evaluation or processing")
    if trigger not in AUTOMATION_TRIGGERS:
        raise ConfigurationError("trigger must be model_registered or upstream_run_finished")
    if (trigger == "upstream_run_finished") != (upstream_rule_id is not None):
        raise ConfigurationError("upstream_rule_id is required for, and only for, upstream_run_finished")
    if isinstance(summary_metrics, str):
        raise ConfigurationError("summary_metrics must be a sequence of strings")
    body: dict[str, Any] = {
        "name": name,
        "enabled": enabled,
        "modelFamilies": list(model_families),
        "kind": kind,
        "trigger": trigger,
        "experimentId": experiment_id,
        "codeVersionId": code_version_id,
        "targetId": target_id,
        "gpuIds": list(gpu_ids),
        "inputDatasetVersionIds": list(input_dataset_version_ids),
        "parameters": dict(parameters or {}),
        "tags": dict(tags or {}),
        "maxAttempts": max_attempts,
    }
    body["upstreamRuleId"] = upstream_rule_id
    body["summaryMetrics"] = list(summary_metrics)
    # 再試行しない。作成を送り直すと2つ目のルールができてしまう。
    return client.request("POST", client.project_path(project_id, "automation-rules"), json=body)


def list_automation_executions(
    client: Client,
    project_id: str,
    *,
    model_version_id: str | None = None,
    rule_id: str | None = None,
) -> list[dict[str, Any]]:
    """条件に合うModelAutomationExecutionを、保留中の登録も含めて新しい順にすべて返す。

    ページはすべて読む。ページングより前のAPIは、最新の100行を1ページで返す。
    """
    optional_values = {"modelVersionId": model_version_id, "ruleId": rule_id}
    conditions = {key: value for key, value in optional_values.items() if value is not None}
    path = client.project_path(project_id, "automation-executions")
    return list(iterate_listed_items(client, path, params=conditions, label="Automation execution list"))


def apply_automation_rule(
    client: Client,
    project_id: str,
    rule_id: str,
    *,
    model_version_id: str | None = None,
    trigger_run_id: str | None = None,
) -> dict[str, Any]:
    """ルールを手で適用する（Project admin）。対象はバージョンか、連鎖するルールなら上流のRun。

    登録で動くルールは``model_version_id``を、``upstream_run_finished``のルールは
    ``trigger_run_id``を取る。確認で飛ばされた場合や失敗した場合も、返す実行としてその結果が戻る。
    """
    if (model_version_id is None) == (trigger_run_id is None):
        raise ConfigurationError("Specify exactly one of model_version_id and trigger_run_id")
    body = {"modelVersionId": model_version_id} if model_version_id else {"triggerRunId": trigger_run_id}
    # 再試行しない。適用のたびに新しい試行が始まる。
    return client.request(
        "POST",
        client.project_path(project_id, f"automation-rules/{path_id(rule_id)}/executions"),
        json=body,
    )


def transfer_automation_rule_owner(
    client: Client, project_id: str, rule_id: str, *, service_account_id: str
) -> dict[str, Any]:
    """ルールをService Accountとして動かし、作成者がいなくなっても動き続けるようにする。

    ``runAsUserId``を持つ更新後のルールを返す。同じ所有者を設定し直しても何も変わらないので、応答が
    失われたらPUTを再試行する。
    """
    return client.request(
        "PUT",
        client.project_path(project_id, f"automation-rules/{path_id(rule_id)}/owner"),
        json={"serviceAccountId": service_account_id},
        retryable=True,
    )
