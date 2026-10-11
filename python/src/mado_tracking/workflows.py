"""Pinned multi-step workflow definitions and their durable executions."""

from __future__ import annotations

from collections.abc import Iterator, Mapping, Sequence
from typing import TYPE_CHECKING, Any
from uuid import uuid4

from .api_paths import path_id
from .pagination import iterate_listed_items

if TYPE_CHECKING:
    from .client import Client


def create_workflow(
    client: Client, project_id: str, *, name: str, steps: Sequence[Mapping[str, Any]], description: str = ""
) -> dict[str, Any]:
    """Save the current Task revisions; each step specifies expectedTaskRevision and input bindings."""
    return client.request(
        "POST",
        client.project_path(project_id, "workflows"),
        json={"name": name, "description": description, "steps": [dict(step) for step in steps]},
    )


def get_workflow(client: Client, project_id: str, workflow_id: str) -> dict[str, Any]:
    return client.request("GET", client.project_path(project_id, f"workflows/{path_id(workflow_id)}"))


def create_workflow_version(
    client: Client,
    project_id: str,
    workflow_id: str,
    *,
    expected_revision: int,
    steps: Sequence[Mapping[str, Any]],
) -> dict[str, Any]:
    return client.request(
        "POST",
        client.project_path(project_id, f"workflows/{path_id(workflow_id)}/versions"),
        json={"expectedRevision": expected_revision, "steps": [dict(step) for step in steps]},
    )


def launch_workflow(
    client: Client,
    project_id: str,
    workflow_id: str,
    *,
    revision: int,
    idempotency_key: str | None = None,
    resume_from_execution_id: str | None = None,
) -> dict[str, Any]:
    """Start once; reuse the idempotency key after a lost response or across process retries."""
    body: dict[str, Any] = {"revision": revision, "idempotencyKey": idempotency_key or str(uuid4())}
    if resume_from_execution_id is not None:
        body["resumeFromExecutionId"] = resume_from_execution_id
    return client.request(
        "POST",
        client.project_path(project_id, f"workflows/{path_id(workflow_id)}/launch"),
        retryable=True,
        json=body,
    )


def get_workflow_execution(client: Client, project_id: str, execution_id: str) -> dict[str, Any]:
    return client.request(
        "GET", client.project_path(project_id, f"workflow-executions/{path_id(execution_id)}")
    )


def cancel_workflow_execution(client: Client, project_id: str, execution_id: str) -> dict[str, Any]:
    return client.request(
        "POST",
        client.project_path(project_id, f"workflow-executions/{path_id(execution_id)}/cancel"),
        retryable=True,
        json={},
    )


def list_workflow_executions(client: Client, project_id: str, workflow_id: str) -> Iterator[dict[str, Any]]:
    return iterate_listed_items(
        client,
        client.project_path(project_id, f"workflows/{path_id(workflow_id)}/executions"),
        params={},
        label="Workflow executions",
    )
