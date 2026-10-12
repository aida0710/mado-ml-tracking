"""Verified parent provenance added after a dataset version was registered."""

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
    """Add confirmed sources without changing the version's content or training references.

    Repeating a parent returns its original reason, evidence and author. This records a
    provenance correction, not a change to the data used during a training run.
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
    """Read registered parents and append-only historical provenance."""
    from .client import path_id

    return client.request(
        "GET",
        client.project_path(
            project_id, f"datasets/{path_id(dataset_id)}/versions/{path_id(version_id)}/parents"
        ),
        retryable=True,
    )
