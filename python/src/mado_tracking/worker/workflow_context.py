"""どの実行のruntimeにも渡す、データセットの使用状況とワークフローの識別情報。

ワークフローより前のAPIはどちらも送らない。その場合Jobにはファイルも変数も渡らないので、
コードはそれらがあるかどうかで判断できる。
"""

from __future__ import annotations

from typing import Any

# このファイルはGET runs/:id/dataset-usageと同じ形なので、コードはどちらからでも同じ文書を扱える。
DATASET_USAGE_FILENAME = "dataset-usage.json"


def workflow_context_fields(run_environment: Any) -> dict[str, Any]:
    """Jobのcontext用の、Runのenvironmentの中のdatasetUsage（配列）とworkflow（オブジェクト）。

    ほかの型の値は、APIが送らなかったものとして除く。
    """
    if not isinstance(run_environment, dict):
        return {}
    fields: dict[str, Any] = {}
    if isinstance(run_environment.get("datasetUsage"), list):
        fields["datasetUsage"] = run_environment["datasetUsage"]
    if isinstance(run_environment.get("workflow"), dict):
        fields["workflow"] = run_environment["workflow"]
    return fields


def dataset_usage_document(context: dict[str, Any]) -> dict[str, Any] | None:
    """MMT_DATASET_USAGE_FILEの中身。Jobにデータセットの使用状況が無ければNone。"""
    if "datasetUsage" not in context:
        return None
    return {"items": context["datasetUsage"]}


def workflow_context_environment(context: dict[str, Any], *, dataset_usage_file: str) -> dict[str, str]:
    environment: dict[str, str] = {}
    if "datasetUsage" in context:
        environment["MMT_DATASET_USAGE_FILE"] = dataset_usage_file
    workflow = context.get("workflow")
    if isinstance(workflow, dict) and isinstance(workflow.get("executionId"), str):
        environment["MMT_WORKFLOW_EXECUTION_ID"] = workflow["executionId"]
    return environment
