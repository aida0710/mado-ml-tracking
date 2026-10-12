"""Dataset usage and workflow identity supplied to every execution runtime.

An API from before workflows sends neither, and a Job then gets no file and no variable, so code
can test for their presence.
"""

from __future__ import annotations

from typing import Any

# The file matches GET runs/:id/dataset-usage, so code can consume the same document either way.
DATASET_USAGE_FILENAME = "dataset-usage.json"


def workflow_context_fields(run_environment: Any) -> dict[str, Any]:
    """The Run environment's datasetUsage (a list) and workflow (an object) for the Job context.

    A value of another type is left out as if the API had not sent it.
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
    """The contents of MMT_DATASET_USAGE_FILE, or None when the Job has no dataset usage."""
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
