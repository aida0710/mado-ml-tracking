"""What the worker tells the API about itself in workerInfo on claim and resume.

Display and the choice of a worker for a computer's checks or a Job only; the API never authorizes
by it.
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

# The distribution name in pyproject.toml; its version is what operators compare across hosts.
DISTRIBUTION_NAME = "mado-tracking"
# A key someone just added shows up as a candidate within a minute, and a worker that claims every
# second still lists its SSH directories only once a minute.
SSH_FILE_SCAN_INTERVAL_SECONDS = 60.0


def describe_host() -> dict[str, str]:
    """The worker host's name and installed version."""
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
