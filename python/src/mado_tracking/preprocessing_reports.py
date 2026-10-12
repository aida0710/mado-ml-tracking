"""Online preprocessing reports recorded before a processing Run finishes."""

from __future__ import annotations

import json
from collections.abc import Mapping, Sequence
from typing import TYPE_CHECKING, Any

from .errors import ConfigurationError

if TYPE_CHECKING:
    from .run import Run


def log_preprocessing_report(
    run: Run,
    *,
    input_count: int,
    output_count: int,
    excluded_count: int = 0,
    failed_count: int = 0,
    input_duration_seconds: float | None = None,
    output_duration_seconds: float | None = None,
    exclusions: Sequence[Mapping[str, Any]] = (),
    failures: Sequence[Mapping[str, Any]] = (),
    metrics: Mapping[str, float] | None = None,
    sample_artifact_ids: Sequence[str] = (),
    metadata: Mapping[str, Any] | None = None,
) -> dict[str, Any]:
    """Replace the report atomically. Reason counts must sum to each excluded/failed total.

    Output count may exceed input count when records are segmented. Identical resends retain the
    report revision. This method requires an online Run; offline logging has no report transport.
    """
    if run.offline_directory is not None:
        raise ConfigurationError(
            "A preprocessing report needs the API; this Run is recording offline and `mado-tracking "
            "sync` does not send reports"
        )
    body = {
        "inputCount": input_count,
        "outputCount": output_count,
        "excludedCount": excluded_count,
        "failedCount": failed_count,
        "inputDurationSeconds": input_duration_seconds,
        "outputDurationSeconds": output_duration_seconds,
        "exclusions": [dict(reason) for reason in exclusions],
        "failures": [dict(reason) for reason in failures],
        "metrics": dict(metrics or {}),
        "sampleArtifactIds": list(sample_artifact_ids),
        "metadata": dict(metadata or {}),
    }
    try:
        json.dumps(body, allow_nan=False)
    except (ValueError, TypeError) as error:
        raise ConfigurationError("Preprocessing reports require finite JSON values") from error
    return run.client.request("PUT", f"{run.api_path}/preprocessing-report", retryable=True, json=body)
