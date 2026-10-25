"""共通のシステムメトリクスの収集を使う、workerのJobのテレメトリ。秘密情報や環境変数は扱わない。"""

from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any

from ..system_metrics import SystemMetricsState, collect


def collect_system_metrics(
    *, pid: int, gpu_ids: list[str], step: int, state_path: Path | None = None
) -> list[dict[str, Any]]:
    """Jobのテレメトリのサンプルを1つ取る。GPUの無いJobはNVMLもnvidia-smiも調べない。

    runnerのpollは毎回新しいプロセスなので、ディスクやネットワークの速度を出すには、
    `state_path`で前回のカウンタをpollの間に保存しておく必要がある。無ければ瞬間の値だけを報告する。
    """
    state = _read_state(state_path)
    try:
        return collect(state, step=step, pid=pid or None, gpu_ids=gpu_ids)
    finally:
        state.close()
        _write_state(state_path, state)


def _read_state(path: Path | None) -> SystemMetricsState:
    if path is None:
        return SystemMetricsState()
    try:
        return SystemMetricsState.from_json(json.loads(path.read_text()))
    except (OSError, ValueError):
        return SystemMetricsState()


def _write_state(path: Path | None, state: SystemMetricsState) -> None:
    if path is None:
        return
    temporary_path = path.with_name(f".{path.name}.tmp")
    try:
        descriptor = os.open(temporary_path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
        with os.fdopen(descriptor, "w") as content:
            json.dump(state.to_json(), content)
        os.replace(temporary_path, path)
    except OSError:
        # 前回のカウンタを失っても、次のサンプルから速度が抜けるだけ。
        pass
