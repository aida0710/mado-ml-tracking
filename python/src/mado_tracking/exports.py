"""Runの比較と、ファイルに保存するCSVのエクスポート（検索結果と比較表）。"""

from __future__ import annotations

import os
import time
from collections.abc import Sequence
from pathlib import Path
from typing import TYPE_CHECKING, Any, BinaryIO

import httpx

from .atomic_files import atomic_output
from .errors import ApiError, ConfigurationError
from .http import DEFAULT_ATTEMPTS, RETRYABLE_STATUS, check_response, retry_delay
from .run_search_request import build_run_search_body

if TYPE_CHECKING:
    from .client import Client

# POST /runs/compareに合わせる。異なるRunを2〜50個、メトリクスのキーは最大200個。
COMPARE_MIN_RUNS = 2
COMPARE_MAX_RUNS = 50
COMPARE_MAX_METRIC_KEYS = 200
INTERRUPTIONS = (httpx.TransportError, httpx.StreamError)


def _validated_run_ids(run_ids: Sequence[str]) -> list[str]:
    if isinstance(run_ids, str):
        raise ConfigurationError("run_ids must be a sequence of strings")
    if not COMPARE_MIN_RUNS <= len(run_ids) <= COMPARE_MAX_RUNS or len(set(run_ids)) != len(run_ids):
        raise ConfigurationError(f"run_ids needs {COMPARE_MIN_RUNS} to {COMPARE_MAX_RUNS} distinct Run IDs")
    return list(run_ids)


def compare_runs(
    client: Client,
    project_id: str,
    run_ids: Sequence[str],
    *,
    baseline_run_id: str | None = None,
    metric_keys: Sequence[str] | None = None,
    include_history: bool = False,
) -> dict[str, Any]:
    """RunComparisonを返す。parameter・メトリクス・タグごとに1行で、Runごとの値を持つ。

    ``baseline_run_id``を渡すと、各行はそれとの差を持つ。Runは渡した順のまま。
    """
    body: dict[str, Any] = {"runIds": _validated_run_ids(run_ids)}
    if baseline_run_id is not None:
        if baseline_run_id not in run_ids:
            raise ConfigurationError("baseline_run_id must be one of run_ids")
        body["baselineRunId"] = baseline_run_id
    if metric_keys is not None:
        if isinstance(metric_keys, str) or len(metric_keys) > COMPARE_MAX_METRIC_KEYS:
            raise ConfigurationError(f"metric_keys must be a sequence of at most {COMPARE_MAX_METRIC_KEYS}")
        body["metricKeys"] = list(metric_keys)
    if include_history:
        body["includeHistory"] = True
    # 比較は読むだけなので、応答が失われても副作用無しに再試行する。
    return client.request("POST", client.project_path(project_id, "runs/compare"), json=body, retryable=True)


def export_runs_csv(
    client: Client, project_id: str, destination: str | os.PathLike[str], **search: Any
) -> Path:
    """検索に合うRunをすべてCSV（1行に1つのRun）で保存し、ファイルのパスを返す。

    ``search``は``Client.search_runs``の条件（``filter``、``order_by``、``experiment_ids``、
    ``kinds``、``statuses``など）を取る。本文はディスクへ流しながら書き、エクスポート全体が届いて
    からファイルが現れる。APIは行数の上限（既定50000）で止め、CSVの最後に打ち切ったことを示す。
    """
    return _save_csv(
        client,
        destination,
        method="POST",
        path=client.project_path(project_id, "runs/search/export.csv"),
        json=build_run_search_body(**search),
    )


def export_comparison_csv(
    client: Client,
    project_id: str,
    destination: str | os.PathLike[str],
    *,
    run_ids: Sequence[str],
    baseline_run_id: str | None = None,
) -> Path:
    """比較表（行のキー×Runの列）をCSVで保存し、ファイルのパスを返す。"""
    params = {"runIds": ",".join(_validated_run_ids(run_ids))}
    if baseline_run_id is not None:
        params["baselineRunId"] = baseline_run_id
    return _save_csv(
        client,
        destination,
        method="GET",
        path=client.project_path(project_id, "runs/compare.csv"),
        params=params,
    )


def _save_csv(
    client: Client, destination: str | os.PathLike[str], *, method: str, path: str, **options: Any
) -> Path:
    target = Path(destination)
    with atomic_output(target) as output:
        _stream_with_retries(client, output, method=method, path=path, **options)
    return target


def _stream_with_retries(client: Client, output: BinaryIO, *, method: str, path: str, **options: Any) -> None:
    """応答の本文を``output``に書く。中断された、または拒まれた試行は最初からやり直す。

    どちらのエクスポートも読むだけなので、繰り返しても安全。バイト列は受け取ったとおりに書くので、
    CSVのUTF-8のBOMと改行コードはそのまま残る。
    """
    for attempt in range(DEFAULT_ATTEMPTS):
        last_attempt = attempt == DEFAULT_ATTEMPTS - 1
        output.seek(0)
        output.truncate()
        try:
            with client.http.stream(method, path.lstrip("/"), **options) as response:
                if response.status_code in RETRYABLE_STATUS and not last_attempt:
                    response.read()
                    time.sleep(retry_delay(attempt, response))
                    continue
                if not response.is_success:
                    response.read()
                    check_response(response, client.masker)
                for chunk in response.iter_bytes():
                    output.write(chunk)
            return
        except INTERRUPTIONS:
            if last_attempt:
                raise ApiError("CSV export kept failing; no file was written") from None
        time.sleep(retry_delay(attempt))
