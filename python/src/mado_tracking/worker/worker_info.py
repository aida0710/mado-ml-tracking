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

from .ssh_files import find_ssh_files

# The distribution name in pyproject.toml; its version is what operators compare across hosts.
DISTRIBUTION_NAME = "mado-tracking"
# A key someone just added shows up as a candidate within a minute, and a worker that claims every
# second still lists its SSH directories only once a minute.
SSH_FILE_SCAN_INTERVAL_SECONDS = 60.0
# What this worker implements beyond the base Job protocol (WORKER_CAPABILITIES in
# packages/contracts). workflowDatasetUsage: a Job gets MMT_DATASET_USAGE_FILE and
# MMT_WORKFLOW_EXECUTION_ID from its Run, so the API hands it workflow steps.
WORKER_CAPABILITIES = ("workflowDatasetUsage",)


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
        # Workers that report workflowDatasetUsage take workflow steps.
        self.reports_capabilities = True
        self.ssh_files = find_ssh_files(self.ssh_directories)
        self.ssh_files_found_at = clock()

    def payload(self) -> dict[str, Any]:
        payload: dict[str, Any] = dict(self.host)
        if self.reports_ssh_files:
            if self.clock() - self.ssh_files_found_at >= SSH_FILE_SCAN_INTERVAL_SECONDS:
                self.ssh_files = find_ssh_files(self.ssh_directories)
                self.ssh_files_found_at = self.clock()
            payload["sshFiles"] = self.ssh_files.to_payload()
        if self.reports_capabilities:
            payload["capabilities"] = list(WORKER_CAPABILITIES)
        return payload

    def stop_reporting_newest_field(self) -> str | None:
        """For an older API, whose strict schema refuses a workerInfo field it does not know.

        Drops the newest field still reported (capabilities came after sshFiles) and returns its
        name, or None when only the host description is left.
        """
        if self.reports_capabilities:
            self.reports_capabilities = False
            return "capabilities"
        if self.reports_ssh_files:
            self.reports_ssh_files = False
            return "sshFiles"
        return None
