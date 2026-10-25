"""PythonからSweepを扱う。Sweepを作って操作し、学習のコードでtrialのparameterを読む。

``SweepsClient``は公開の``Client.request``を包む。client.pyは担当者の管理のまま変えない。
書き込み（作成、一時停止、再開、取り消し）は冪等ではないので、再試行せずに1回だけ送る。
読み出しはSDKのほかの読み出しと同じく再試行する。
"""

from __future__ import annotations

import json
import os
from collections.abc import Iterator, Mapping
from pathlib import Path
from typing import Any

from .client import Client, path_id
from .errors import ConfigurationError
from .sweep_config import convert_sweep_config

PARAMETERS_JSON_VARIABLE = "MMT_PARAMETERS_JSON"
PARAMETERS_FILE_VARIABLE = "MMT_PARAMETERS_FILE"
# GET /projects/:p/sweepsに合わせる。limitは既定50、上限200。
SWEEP_LIST_MAX_PAGE_SIZE = 200
SWEEP_LIST_DEFAULT_PAGE_SIZE = 50
# GET /projects/:p/sweeps/:s/trialsに合わせる。limitは既定100、上限500。
TRIAL_LIST_MAX_PAGE_SIZE = 500
TRIAL_LIST_DEFAULT_PAGE_SIZE = 100
TRIAL_ORDERS = ("trial_index", "objective")


def trial_parameters(defaults: Mapping[str, Any] | None = None) -> dict[str, Any]:
    """workerから渡されたRunのparameterを、``defaults``に重ねたもの。

    MMT_PARAMETERS_JSONは、MMT_PARAMETERS_FILEが指すファイルより優先する。workerの外ではどちらも
    設定されず``defaults``を返すので、同じスクリプトを手元で試せる。値はJSONの型のまま。文字列の
    ``"0.1"``は文字列のまま残る。
    """
    merged = dict(defaults or {})
    merged.update(_worker_parameters())
    return merged


def _worker_parameters() -> dict[str, Any]:
    encoded = os.environ.get(PARAMETERS_JSON_VARIABLE)
    source = PARAMETERS_JSON_VARIABLE
    if encoded is None:
        file_name = os.environ.get(PARAMETERS_FILE_VARIABLE)
        if not file_name:
            return {}
        source = PARAMETERS_FILE_VARIABLE
        try:
            encoded = Path(file_name).read_text(encoding="utf-8")
        except OSError:
            raise ConfigurationError(f"{PARAMETERS_FILE_VARIABLE} names an unreadable file") from None
    try:
        parameters = json.loads(encoded)
    except ValueError:
        raise ConfigurationError(f"{source} is not valid JSON") from None
    if not isinstance(parameters, dict):
        raise ConfigurationError(f"{source} must contain a JSON object")
    return parameters


class SweepsClient:
    def __init__(self, client: Client):
        self.client = client

    def create_sweep(
        self,
        project_id: str,
        *,
        task_id: str,
        config: Mapping[str, Any],
        name: str,
        target_id: str | None = None,
        gpu_ids: list[str] | None = None,
        seed: int | None = None,
    ) -> dict[str, Any]:
        """W&B形式の設定からSweepを作る（変換の規則はdocs/sweeps.mdを参照）。

        trialのRunはTaskの実験に入る。``target_id`` / ``gpu_ids``がNoneなら、Taskの値を使う。
        """
        body: dict[str, Any] = {
            "name": name,
            "taskId": task_id,
            **convert_sweep_config(config),
            "targetId": target_id,
            "gpuIds": gpu_ids,
        }
        if seed is not None:
            body["seed"] = seed
        return self.client.request("POST", self._sweeps_path(project_id), json=body)

    def get_sweep(self, project_id: str, sweep_id: str) -> dict[str, Any]:
        return self.client.request("GET", self._sweep_path(project_id, sweep_id), retryable=True)

    def iter_sweeps(
        self, project_id: str, *, status: str | None = None, page_size: int = SWEEP_LIST_DEFAULT_PAGE_SIZE
    ) -> Iterator[dict[str, Any]]:
        """ProjectのすべてのSweepを新しい順に返す。ページは必要になってから取得する。"""
        _check_page_size(page_size, SWEEP_LIST_MAX_PAGE_SIZE)
        query: dict[str, Any] = {"limit": page_size}
        if status is not None:
            query["status"] = status
        return self._iter_pages(self._sweeps_path(project_id), query)

    def iter_trials(
        self,
        project_id: str,
        sweep_id: str,
        *,
        order_by: str = "trial_index",
        page_size: int = TRIAL_LIST_DEFAULT_PAGE_SIZE,
    ) -> Iterator[dict[str, Any]]:
        """Sweepのすべてのtrial。``objective``の順では最良が先頭、スコアの無いtrialが最後になる。"""
        if order_by not in TRIAL_ORDERS:
            raise ConfigurationError(f"order_by must be one of {', '.join(TRIAL_ORDERS)}")
        _check_page_size(page_size, TRIAL_LIST_MAX_PAGE_SIZE)
        return self._iter_pages(
            self._sweep_path(project_id, sweep_id, "trials"), {"orderBy": order_by, "limit": page_size}
        )

    def best_trial(self, project_id: str, sweep_id: str) -> dict[str, Any] | None:
        """終了または早期停止したtrialのうち、目的メトリクスが最良のもの。まだ無ければNone。"""
        best = self.get_sweep(project_id, sweep_id).get("bestTrial")
        if best is not None and not isinstance(best, dict):
            raise ConfigurationError("Sweep response has an invalid bestTrial")
        return best

    def pause(self, project_id: str, sweep_id: str) -> dict[str, Any]:
        return self.client.request("POST", self._sweep_path(project_id, sweep_id, "pause"))

    def resume(self, project_id: str, sweep_id: str) -> dict[str, Any]:
        return self.client.request("POST", self._sweep_path(project_id, sweep_id, "resume"))

    def cancel(
        self, project_id: str, sweep_id: str, *, cancel_running_trials: bool = False
    ) -> dict[str, Any]:
        """Sweepを止める。順番待ちのtrialは必ず取り消し、実行中のものは指定時だけ取り消す。"""
        return self.client.request(
            "POST",
            self._sweep_path(project_id, sweep_id, "cancel"),
            json={"cancelRunningTrials": cancel_running_trials},
        )

    def _sweeps_path(self, project_id: str) -> str:
        return self.client.project_path(project_id, "sweeps")

    def _sweep_path(self, project_id: str, sweep_id: str, action: str = "") -> str:
        return self.client.project_path(
            project_id, f"sweeps/{path_id(sweep_id)}" + (f"/{action}" if action else "")
        )

    def _iter_pages(self, path: str, query: dict[str, Any]) -> Iterator[dict[str, Any]]:
        visited_cursors: set[str] = set()
        while True:
            page = self.client.request("GET", path, params=query, retryable=True)
            items = page.get("items")
            if not isinstance(items, list) or not all(isinstance(item, dict) for item in items):
                raise ConfigurationError("Sweep list response must contain items")
            yield from items
            cursor = page.get("nextCursor")
            if cursor is None:
                return
            if not isinstance(cursor, str) or not cursor or cursor in visited_cursors:
                raise ConfigurationError("Sweep list returned an invalid or repeated pagination cursor")
            visited_cursors.add(cursor)
            query = {**query, "cursor": cursor}


def _check_page_size(page_size: int, maximum: int) -> None:
    if not 1 <= page_size <= maximum:
        raise ConfigurationError(f"page_size must be between 1 and {maximum}")
