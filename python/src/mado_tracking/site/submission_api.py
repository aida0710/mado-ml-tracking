"""The site endpoints: a launcher's (its own token) and `mado-tracking submit`'s (one's own token).

The API knows a launcher by its token, so no request names the launcher. Claims are never
retried: a lost answer leaves the Jobs `submitting` until the API fails them, while a resent
claim would take further Jobs instead. The one exception is a claim an older API refuses for a
field it does not know, which accepted nothing (newer_request_fields.py).
"""

from __future__ import annotations

import time
from collections.abc import Callable, Collection, Sequence
from typing import Any

from ..api_paths import path_id
from ..client import Client
from ..errors import ApiError, ConfigurationError
from ..newer_request_fields import NewerRequestFields
from ..worker.capabilities import WORKER_CAPABILITIES
from .launcher_assignment import LauncherAssignment, SchedulerCancellation
from .site_settings import ManualSiteConfiguration

# Client errors that a later attempt may not repeat: a request timeout and a rate limit.
TEMPORARY_CLIENT_ERRORS = frozenset({408, 429})
CLIENT_ERROR_STATUSES = range(400, 500)
# The claim fields an older API may refuse, oldest first, with what is lost while it does.
REFUSED_CLAIM_FIELD_WARNINGS = {
    "capabilities": (
        "The API does not take capabilities in site claims; Jobs are claimed without reporting what "
        "the runner supports until the API is upgraded"
    ),
}


def refused_for_good(error: ApiError) -> bool:
    """The API would answer the same request the same way later (a 4xx but 408 and 429)."""
    status = error.status_code
    return status is not None and status in CLIENT_ERROR_STATUSES and status not in TEMPORARY_CLIENT_ERRORS


def _newer_claim_fields(offered: Collection[str]) -> dict[str, Any]:
    """The claim fields of `offered`: what the runner this package installs passes to a Job."""
    return {"capabilities": list(WORKER_CAPABILITIES)} if "capabilities" in offered else {}


def _items(response: dict[str, Any], label: str) -> list[dict[str, Any]]:
    items = response.get("items")
    if not isinstance(items, list) or not all(isinstance(item, dict) for item in items):
        raise ConfigurationError(f"{label} response must contain items")
    return items


class LauncherApi:
    def __init__(self, client: Client, *, clock: Callable[[], float] = time.monotonic):
        self.client = client
        self.claim_fields = NewerRequestFields(REFUSED_CLAIM_FIELD_WARNINGS, clock=clock)

    def assignment(self) -> LauncherAssignment:
        return LauncherAssignment.parse(self.client.request("GET", "launcher/config", retryable=True))

    def publish_key(self, key_id: str, public_key: str) -> None:
        self.client.request(
            "PUT", f"launcher/keys/{path_id(key_id)}", json={"publicKey": public_key}, retryable=True
        )

    def report_connection_check(self, check_id: str, *, failure: str | None) -> None:
        """`failure` is why the login failed; None reports a success."""
        self.client.request(
            "POST",
            f"launcher/connection-checks/{path_id(check_id)}",
            json={"outcome": "succeeded" if failure is None else "failed", "message": failure},
            retryable=True,
        )

    def claim(self, target_ids: Sequence[str], *, limit: int) -> list[dict[str, Any]]:
        body = {"targetIds": list(target_ids), "limit": limit}
        response = self.claim_fields.send(
            lambda offered: self.client.request(
                "POST", "launcher/site-submissions/claim", json={**body, **_newer_claim_fields(offered)}
            )
        )
        return _items(response, "Site submission claim")

    def report(self, results: Sequence[dict[str, Any]]) -> list[dict[str, Any]]:
        response = self.client.request(
            "POST", "launcher/site-submissions/report", json={"results": list(results)}, retryable=True
        )
        return _items(response, "Site submission report")

    def cancellations(self, target_ids: Sequence[str]) -> list[SchedulerCancellation]:
        response = self.client.request(
            "POST",
            "launcher/site-submissions/cancellations",
            json={"targetIds": list(target_ids)},
            retryable=True,
        )
        return [SchedulerCancellation.parse(item) for item in _items(response, "Site cancellation list")]

    def report_cancellations(self, job_ids: Sequence[str]) -> None:
        self.client.request(
            "POST",
            "launcher/site-submissions/cancellations/report",
            json={"jobIds": list(job_ids)},
            retryable=True,
        )


class ManualSubmissionApi:
    def __init__(self, client: Client, *, submitter_id: str):
        self.client = client
        self.submitter_id = submitter_id
        self.claim_fields = NewerRequestFields(REFUSED_CLAIM_FIELD_WARNINGS)

    def waiting(self) -> list[dict[str, Any]]:
        return _items(
            self.client.request("GET", "manual-submissions", retryable=True), "Manual submission list"
        )

    def site_configuration(self, target_id: str) -> ManualSiteConfiguration:
        return ManualSiteConfiguration.parse(
            self.client.request("GET", f"manual-submissions/sites/{path_id(target_id)}", retryable=True)
        )

    def claim(self, target_id: str, *, limit: int, all_jobs: bool) -> list[dict[str, Any]]:
        """`all_jobs` takes every waiting Job of a computer one owns, not only one's own."""
        body = {"targetId": target_id, "submitterId": self.submitter_id, "limit": limit, "all": all_jobs}
        response = self.claim_fields.send(
            lambda offered: self.client.request(
                "POST", "manual-submissions/claim", json={**body, **_newer_claim_fields(offered)}
            )
        )
        return _items(response, "Manual submission claim")

    def report(self, results: Sequence[dict[str, Any]]) -> list[dict[str, Any]]:
        response = self.client.request(
            "POST",
            "manual-submissions/report",
            json={"submitterId": self.submitter_id, "results": list(results)},
            retryable=True,
        )
        return _items(response, "Manual submission report")
