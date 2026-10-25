"""siteのJobが残したもの（ソースのスナップショット、出力、そのメトリクスと宣言）を保存する。

保存した項目は覚えておくので、保存が途中で止まったあとの再試行では足りない分だけを送る。
出力は、validate_resultsが確かめたディスクリプタを通して読み、パスでは開き直さない。
"""

from __future__ import annotations

from collections.abc import Iterator
from contextlib import contextmanager
from pathlib import Path
from typing import Any

from ..errors import ConfigurationError
from ..worker.container_outputs import artifact_key, open_output, parse_output_index, read_output_index
from ..worker.contracts import WorkerJob
from ..worker.session_outputs import validated_snapshot_artifacts
from ..worker.source_snapshot import SNAPSHOT_DIRECTORY, SNAPSHOT_FILENAMES
from .runner_api import RunnerApi

# Linuxでは、開いているファイルがここに名前を持つ。ここから読み直すと、パスが変わっていても
# そのファイルを読む。
OPEN_FILE_DIRECTORY = Path("/proc/self/fd")


@contextmanager
def opened_output(outputs: Path, path: str) -> Iterator[Path]:
    """open_outputが開いた通常ファイルそのものを読むパス。"""
    with open_output(outputs, path) as content:
        if OPEN_FILE_DIRECTORY.is_dir():
            yield OPEN_FILE_DIRECTORY / str(content.fileno())
        else:
            yield outputs / path


class OutputSaver:
    def __init__(self, job: WorkerJob, *, api: RunnerApi, workspace: Path):
        self.job = job
        self.api = api
        self.workspace = workspace
        self.saved: set[str] = set()
        self.metrics_sent = False
        self.registered: set[int] = set()

    async def save_snapshot(self, snapshot: dict[str, Any]) -> None:
        for artifact in validated_snapshot_artifacts(self.job, snapshot):
            key = f"snapshot:{artifact_key(artifact)}"
            if key in self.saved:
                continue
            source = self.workspace / SNAPSHOT_DIRECTORY / SNAPSHOT_FILENAMES[artifact["path"]]
            await self.api.upload_snapshot_artifact(self.job, artifact, source)
            self.saved.add(key)

    async def save_outputs(self, results: dict[str, Any]) -> None:
        """出力（RunのArtifact `container/<path>`）、メトリクス、result.jsonの宣言の順に送る。"""
        outputs = self.workspace / "outputs"
        for artifact in parse_output_index(read_output_index(self.workspace, results)):
            key = artifact_key(artifact)
            if key in self.saved:
                continue
            with opened_output(outputs, artifact["path"]) as source:
                await self.api.upload_output_artifact(self.job, artifact, source)
            self.saved.add(key)
        if not self.metrics_sent:
            if results["metrics"]:
                await self.api.metrics(results["metrics"])
            self.metrics_sent = True
        # 宣言は保存済みのArtifactを名指しするので、すべての出力を保存してから送る。
        remaining = [item for item in results.get("declarations", []) if item["index"] not in self.registered]
        if remaining:
            items = await self.api.declare_outputs(remaining)
            self.registered.update(item["index"] for item in items)
            if any(item["index"] not in self.registered for item in remaining):
                raise ConfigurationError("Output declaration response omitted a declared output")
