"""学習のコードが記録する、stepごとのデータの構成。"""

from __future__ import annotations

import json
from collections.abc import Mapping, Sequence
from typing import TYPE_CHECKING, Any

from .errors import ConfigurationError
from .media import validate_step

if TYPE_CHECKING:
    from .run import Run


def log_training_data_stage(
    run: Run,
    *,
    start_step: int,
    input_dataset_version_ids: Sequence[str],
    checkpoint_id: str | None = None,
    metadata: Mapping[str, Any] | None = None,
) -> dict[str, Any]:
    """学習のローダーを変えたあと、このstepから使うすべてのデータセットを記録する。

    前のデータセットも、まだ使っているならリストに残す。再送しても問題ないが、記録済みのstepは
    置き換えられない。このメソッドにはAPIが要り、ローダー自体は変えない。
    """
    if run.entity.get("kind") not in {"training", "finetuning"}:
        raise ConfigurationError("Training data stages require a training or finetuning Run")
    if run.offline_directory is not None:
        raise ConfigurationError("Training data stages need an online Run")
    validate_step(start_step)
    versions = list(input_dataset_version_ids)
    if not versions or len(set(versions)) != len(versions):
        raise ConfigurationError("List every dataset version once; at least one is required")
    body = {
        "startStep": start_step,
        "inputDatasetVersionIds": versions,
        "checkpointId": checkpoint_id,
        "metadata": dict(metadata or {}),
    }
    try:
        json.dumps(body, allow_nan=False)
    except (ValueError, TypeError) as error:
        raise ConfigurationError("Training data metadata requires finite JSON values") from error
    return run.client.request("POST", f"{run.api_path}/training-data-stages", retryable=True, json=body)


def training_data_stages(run: Run) -> dict[str, Any]:
    """最初のデータセットと、記録したすべてのデータの構成をstep順に読む。"""
    return run.client.request("GET", f"{run.api_path}/training-data-stages", retryable=True)
