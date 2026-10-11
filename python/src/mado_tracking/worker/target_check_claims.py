"""The API's WorkerTargetCheck: which request this worker claimed and what it asks for."""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass
from typing import Any

from ..errors import ConfigurationError

CONNECTION = "connection"
DIRECTORY_LISTING = "directory_listing"
# TARGET_CHECK_KINDS of the contract: what this worker runs.
TARGET_CHECK_KINDS = (CONNECTION, DIRECTORY_LISTING)
# TargetCheckResult versions: 2 adds the host and the Python and directory candidates.
RESULT_VERSION_BEFORE_SETUP = 1
RESULT_VERSION = 2


@dataclass(frozen=True)
class ClaimedTargetCheck:
    check_id: str
    lease_id: str
    target: dict[str, Any]
    kind: str
    # The directory a listing reads, as requested; None for a connection check.
    directory_path: str | None
    # The TargetCheckResult version the API takes; APIs from before computer setup take only 1.
    result_version: int


def is_assigned_to(check: dict[str, Any], worker_id: str) -> bool:
    assigned = check.get("assignedWorker")
    return isinstance(assigned, dict) and assigned.get("workerId") == worker_id


def parse_claimed_target_check(
    item: Any, *, worker_id: str, target_ids: Sequence[str]
) -> ClaimedTargetCheck | None:
    if item is None:
        return None
    if (
        not isinstance(item, dict)
        or not isinstance(item.get("leaseId"), str)
        or not isinstance(check := item.get("check"), dict)
        or not isinstance(check.get("id"), str)
        or not isinstance(target := item.get("target"), dict)
    ):
        raise ConfigurationError("Target check claim response is invalid")
    # A request assigned to this worker may name a computer outside MMT_WORKER_TARGET_IDS (one that
    # is being added); any other must be one of this worker's computers.
    if target.get("id") not in target_ids and not is_assigned_to(check, worker_id):
        raise ConfigurationError("Target check claim names a computer this worker is not in charge of")
    if "kind" not in item:
        # An API from before directory listings: connection checks with version 1 results.
        return ClaimedTargetCheck(
            check_id=check["id"],
            lease_id=item["leaseId"],
            target=target,
            kind=CONNECTION,
            directory_path=None,
            result_version=RESULT_VERSION_BEFORE_SETUP,
        )
    kind = item["kind"]
    directory_path = item.get("directoryPath")
    if kind not in TARGET_CHECK_KINDS or (
        kind == DIRECTORY_LISTING and (not isinstance(directory_path, str) or not directory_path)
    ):
        raise ConfigurationError("Target check claim response has an unknown kind or no directory")
    return ClaimedTargetCheck(
        check_id=check["id"],
        lease_id=item["leaseId"],
        target=target,
        kind=kind,
        directory_path=directory_path if kind == DIRECTORY_LISTING else None,
        result_version=RESULT_VERSION,
    )
