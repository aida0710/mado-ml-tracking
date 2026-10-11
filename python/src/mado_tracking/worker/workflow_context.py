"""Dataset usage and workflow identity supplied to every execution runtime."""

from __future__ import annotations

from typing import Any

# The file matches GET runs/:id/dataset-usage, so code can consume the same document either way.
DATASET_USAGE_FILENAME = "dataset-usage.json"


def workflow_context_environment(context: dict[str, Any], *, dataset_usage_file: str) -> dict[str, str]:
    environment: dict[str, str] = {}
    if "datasetUsage" in context:
        environment["MMT_DATASET_USAGE_FILE"] = dataset_usage_file
    workflow = context.get("workflow")
    if isinstance(workflow, dict) and isinstance(workflow.get("executionId"), str):
        environment["MMT_WORKFLOW_EXECUTION_ID"] = workflow["executionId"]
    return environment
