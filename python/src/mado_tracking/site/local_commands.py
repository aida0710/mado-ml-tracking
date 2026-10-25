"""共有のステージングのコードが送るデータセットのコマンドに、runner自身が答える。

workerのステージングのコード（worker/dataset_staging.py）は、対象のrunnerにデータセットの
キャッシュを埋めるよう頼む。site上ではそのrunnerがこのプロセスなので、コマンドはここで、
daemonスレッドとして動く。
"""

from __future__ import annotations

import io
from pathlib import Path
from typing import Any

from ..errors import ConfigurationError
from ..worker.dataset_runner import run_dataset_command
from ..worker.host_runner import DATASET_COMMANDS
from .daemon_thread import run_in_daemon_thread


class LocalRunnerCommands:
    def __init__(self, workspace: Path):
        self.workspace = workspace
        self.staged_inputs: dict[str, Any] = {}

    async def command(
        self, name: str, *, payload: dict[str, Any] | None = None, stdin_file: Path | None = None
    ) -> dict[str, Any]:
        if name not in DATASET_COMMANDS:
            raise ConfigurationError(f"The site runner does not relay the {name} command")

        def run() -> dict[str, Any]:
            if stdin_file is None:
                return run_dataset_command(name, self.workspace, io.BytesIO(b""))
            with stdin_file.open("rb") as stream:
                return run_dataset_command(name, self.workspace, stream)

        return await run_in_daemon_thread(run, name=f"mmt-{name}")
