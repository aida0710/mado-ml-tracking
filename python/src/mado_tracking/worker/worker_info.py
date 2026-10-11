"""What the worker tells the API about itself in workerInfo on claim and resume.

Display and the choice of a worker for a computer's checks only; the API never authorizes by it.
"""

from __future__ import annotations

import socket
import time
from collections.abc import Callable, Sequence
from importlib import metadata
from pathlib import Path
from typing import Any

from .ssh_files import find_ssh_files

# The distribution name in pyproject.toml; its version is what operators compare across hosts.
DISTRIBUTION_NAME = "mado-tracking"
# A key someone just added shows up as a candidate within a minute, and a worker that claims every
# second still lists its SSH directories only once a minute.
SSH_FILE_SCAN_INTERVAL_SECONDS = 60.0


def describe_host() -> dict[str, str]:
    """The worker host's name and installed version."""
    description = {"hostname": socket.gethostname()}
    try:
        description["version"] = metadata.version(DISTRIBUTION_NAME)
    except metadata.PackageNotFoundError:
        # A source checkout without installation has no version to report.
        pass
    return description


class WorkerInfo:
    def __init__(self, *, ssh_directories: Sequence[Path], clock: Callable[[], float] = time.monotonic):
        self.host = describe_host()
        self.ssh_directories = tuple(ssh_directories)
        self.clock = clock
        # Workers that report their SSH files take the checks the Web assigns to them.
        self.reports_ssh_files = True
        self.ssh_files = find_ssh_files(self.ssh_directories)
        self.ssh_files_found_at = clock()

    def payload(self) -> dict[str, Any]:
        if not self.reports_ssh_files:
            return dict(self.host)
        if self.clock() - self.ssh_files_found_at >= SSH_FILE_SCAN_INTERVAL_SECONDS:
            self.ssh_files = find_ssh_files(self.ssh_directories)
            self.ssh_files_found_at = self.clock()
        return {**self.host, "sshFiles": self.ssh_files.to_payload()}

    def stop_reporting_ssh_files(self) -> None:
        """For an API from before computer setup, which refuses workerInfo with sshFiles."""
        self.reports_ssh_files = False
