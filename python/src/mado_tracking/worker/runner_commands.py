"""workerのステージングのコードが呼ぶ、コンピュータ側のrunnerのコマンド。

JobExecutorはこれをSSHで送る。siteのrunnerは同じコマンドに自分のプロセスの中で応える。
`staged_inputs`は、実行仕様のstagedInputsのために、ステージングしたものを集める。
"""

from __future__ import annotations

from pathlib import Path
from typing import Any, Protocol


class RunnerCommands(Protocol):
    staged_inputs: dict[str, Any]

    async def command(
        self, name: str, *, payload: dict[str, Any] | None = None, stdin_file: Path | None = None
    ) -> dict[str, Any]: ...
