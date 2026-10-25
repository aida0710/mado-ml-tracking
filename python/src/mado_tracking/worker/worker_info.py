"""取得と再開のときに、workerがworkerInfoでAPIに伝える自分自身の情報。

表示と、コンピュータの確認やJobにどのworkerを使うかの選択にだけ使う。APIはこれで認可を判断しない。
"""

from __future__ import annotations

import socket
import time
from collections.abc import Callable, Sequence
from importlib import metadata
from pathlib import Path
from typing import Any

from ..errors import ConfigurationError
from .capabilities import WORKER_CAPABILITIES
from .ssh_files import find_ssh_files

# pyproject.tomlのディストリビューション名。運用担当者はそのバージョンをホスト間で比べる。
DISTRIBUTION_NAME = "mado-tracking"
# 誰かが追加した鍵は1分以内に候補に現れる。また、毎秒取得を行うworkerでも、
# SSHのディレクトリの一覧を取るのは1分に1回だけ。
SSH_FILE_SCAN_INTERVAL_SECONDS = 60.0


def describe_host() -> dict[str, str]:
    """workerホストの名前と、インストールされたバージョン。"""
    description: dict[str, str] = {"hostname": socket.gethostname()}
    try:
        description["version"] = metadata.version(DISTRIBUTION_NAME)
    except metadata.PackageNotFoundError:
        raise ConfigurationError("Install mado-tracking before starting the worker") from None
    return description


class WorkerInfo:
    def __init__(self, *, ssh_directories: Sequence[Path], clock: Callable[[], float] = time.monotonic):
        self.host = describe_host()
        self.ssh_directories = tuple(ssh_directories)
        self.clock = clock
        self.ssh_files = find_ssh_files(self.ssh_directories)
        self.ssh_files_found_at = clock()

    def payload(self, *, parallel_jobs: int) -> dict[str, Any]:
        if self.clock() - self.ssh_files_found_at >= SSH_FILE_SCAN_INTERVAL_SECONDS:
            self.ssh_files = find_ssh_files(self.ssh_directories)
            self.ssh_files_found_at = self.clock()
        return {
            **self.host,
            "parallelJobs": parallel_jobs,
            "sshFiles": self.ssh_files.to_payload(),
            "capabilities": list(WORKER_CAPABILITIES),
        }
