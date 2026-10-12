"""What the worker tells the API about itself in workerInfo on claim and resume.

Display and the choice of a worker for a computer's checks or a Job only; the API never authorizes
by it.
"""

from __future__ import annotations

import socket
import time
from collections.abc import Callable, Collection, Sequence
from importlib import metadata
from pathlib import Path
from typing import Any

from ..newer_request_fields import NewerRequestFields
from .capabilities import WORKER_CAPABILITIES
from .ssh_files import find_ssh_files

# The distribution name in pyproject.toml; its version is what operators compare across hosts.
DISTRIBUTION_NAME = "mado-tracking"
# A key someone just added shows up as a candidate within a minute, and a worker that claims every
# second still lists its SSH directories only once a minute.
SSH_FILE_SCAN_INTERVAL_SECONDS = 60.0
# The workerInfo fields an older API may refuse, oldest first (capabilities came after sshFiles),
# with what the operator loses while it does.
REFUSED_WORKER_INFO_WARNINGS = {
    "sshFiles": (
        "The API does not take SSH files in workerInfo; the Web cannot assign computer checks "
        "to this worker until the API is upgraded"
    ),
    "capabilities": (
        "The API does not take capabilities in workerInfo; this worker keeps claiming Jobs without "
        "reporting what it supports until the API is upgraded"
    ),
}


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
        # Workers that report their SSH files take the checks the Web assigns to them, and workers
        # that report workflowDatasetUsage take workflow steps; an older API refuses either.
        self.newer_fields = NewerRequestFields(REFUSED_WORKER_INFO_WARNINGS, clock=clock)
        self.ssh_files = find_ssh_files(self.ssh_directories)
        self.ssh_files_found_at = clock()

    def payload(self, offered: Collection[str]) -> dict[str, Any]:
        """The host description, with the fields of `offered` (newer_fields.offered())."""
        payload: dict[str, Any] = dict(self.host)
        if "sshFiles" in offered:
            if self.clock() - self.ssh_files_found_at >= SSH_FILE_SCAN_INTERVAL_SECONDS:
                self.ssh_files = find_ssh_files(self.ssh_directories)
                self.ssh_files_found_at = self.clock()
            payload["sshFiles"] = self.ssh_files.to_payload()
        if "capabilities" in offered:
            payload["capabilities"] = list(WORKER_CAPABILITIES)
        return payload
