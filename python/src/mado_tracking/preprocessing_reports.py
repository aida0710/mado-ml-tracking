"""processingのRunが終わる前に記録する、オンラインの前処理レポート。"""

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
    """レポートを不可分に置き換える。理由ごとの件数の合計は、excluded/failedの各総数と一致させる。

    レコードを分割した場合、出力件数は入力件数を超えてよい。同じ内容を送り直しても、レポートの
    revisionは変わらない。このメソッドにはオンラインのRunが要る。オフラインの記録には、
    レポートを送る手段が無い。
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
