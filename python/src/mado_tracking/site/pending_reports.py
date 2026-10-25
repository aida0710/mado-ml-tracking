"""報告がまだAPIに届いていない投入の結果。届くまでディスクに置いておく。

job shellはこれらのJobを既に投入している。報告が無いと、runnerが既に待ち行列にいるかも
しれないのに、APIはSITE_SUBMISSION_REPORT_TIMEOUT_SECONDSのあとにJobを失敗にする。結果は
送る前に保存するので、その間にクラッシュしても何も失わない。APIが受け取るか、今後も拒む
（409。前の写しが届いたか、その間にJobが`submitting`から移った）まで、保存したままにする。
"""

from __future__ import annotations

import json
import os
import uuid
from collections.abc import Callable, Sequence
from pathlib import Path
from typing import Any

from ..errors import ApiError
from ..worker.host_state import read_json, write_json
from .submission_api import refused_for_good

ReportSender = Callable[[Sequence[dict[str, Any]]], object]


def _is_result(document: dict[str, Any]) -> bool:
    job_ids = document.get("jobIds")
    return isinstance(job_ids, list) and bool(job_ids) and all(isinstance(job_id, str) for job_id in job_ids)


class PendingReports:
    def __init__(self, directory: Path, *, send: ReportSender, notice: Callable[[str], None]):
        directory.mkdir(mode=0o700, parents=True, exist_ok=True)
        self.directory = directory
        self.send = send
        self.notice = notice

    def report(self, result: dict[str, Any]) -> None:
        # 先に保存する。job shellは投入済みなので、ここからは報告がクラッシュしても残る必要がある。
        path = self.directory / f"{uuid.uuid4()}.json"
        write_json(path, result)
        if self._deliver(result):
            self._discard(path)

    def resend(self) -> None:
        for path, saved in self._saved():
            if not _is_result(saved):
                # 1つのProjectのworker tokenを使うlauncherが保存したもの。APIはもう受け付けない。
                self.notice(f"Dropped the saved report {path.name}, which this version cannot send")
                self._discard(path)
            elif self._deliver(saved):
                self._discard(path)

    def _deliver(self, result: dict[str, Any]) -> bool:
        """報告を送り直す必要が無ければ（届いたか、今後も拒まれる）True。"""
        jobs = ",".join(result["jobIds"])
        try:
            self.send([result])
            return True
        except ApiError as error:
            if refused_for_good(error):
                self.notice(f"Report for {jobs} refused: {error}")
                return True
            self.notice(f"Report for {jobs} deferred: {error}")
            return False

    def _saved(self) -> list[tuple[Path, dict[str, Any]]]:
        saved = []
        for path in sorted(self.directory.glob("*.json"), key=lambda item: item.stat().st_mtime):
            try:
                saved.append((path, read_json(path)))
            except (OSError, ValueError, json.JSONDecodeError):
                # 書きかけで切れたものは報告ではない。捨てれば、それらのJobはAPIが失敗にする。
                path.unlink(missing_ok=True)
        return saved

    def _discard(self, path: Path) -> None:
        path.unlink(missing_ok=True)
        try:
            directory = os.open(self.directory, os.O_DIRECTORY)
        except OSError:
            return
        try:
            os.fsync(directory)
        finally:
            os.close(directory)
