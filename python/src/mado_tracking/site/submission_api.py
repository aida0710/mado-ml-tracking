"""siteのエンドポイント。launcher用（自身のtoken）と`mado-tracking submit`用（本人のtoken）。

APIはtokenでlauncherを見分けるので、リクエストにlauncherの名前は入れない。claimは再試行しない。
応答が届かなかったJobは、APIが失敗にするまで`submitting`のまま残る。一方、claimを再送すると
別のJobをさらに取ってしまう。
"""

from __future__ import annotations

from collections.abc import Sequence
from typing import Any

from ..api_paths import path_id
from ..client import Client
from ..errors import ApiError, ConfigurationError
from ..worker.capabilities import WORKER_CAPABILITIES
from .launcher_assignment import LauncherAssignment, SchedulerCancellation
from .site_settings import ManualSiteConfiguration

# 後で試せば起きないかもしれないクライアントエラー。リクエストのタイムアウトとレート制限。
TEMPORARY_CLIENT_ERRORS = frozenset({408, 429})
CLIENT_ERROR_STATUSES = range(400, 500)


def refused_for_good(error: ApiError) -> bool:
    """同じリクエストには後でもAPIが同じ応答を返す（408と429を除く4xx）。"""
    status = error.status_code
    return status is not None and status in CLIENT_ERROR_STATUSES and status not in TEMPORARY_CLIENT_ERRORS


def _items(response: dict[str, Any], label: str) -> list[dict[str, Any]]:
    items = response.get("items")
    if not isinstance(items, list) or not all(isinstance(item, dict) for item in items):
        raise ConfigurationError(f"{label} response must contain items")
    return items


class LauncherApi:
    def __init__(self, client: Client):
        self.client = client

    def assignment(self) -> LauncherAssignment:
        return LauncherAssignment.parse(self.client.request("GET", "launcher/config", retryable=True))

    def publish_key(self, key_id: str, public_key: str) -> None:
        self.client.request(
            "PUT", f"launcher/keys/{path_id(key_id)}", json={"publicKey": public_key}, retryable=True
        )

    def report_connection_check(self, check_id: str, *, failure: str | None) -> None:
        """`failure`はログインが失敗した理由。Noneなら成功を報告する。"""
        self.client.request(
            "POST",
            f"launcher/connection-checks/{path_id(check_id)}",
            json={"outcome": "succeeded" if failure is None else "failed", "message": failure},
            retryable=True,
        )

    def claim(self, target_ids: Sequence[str], *, limit: int) -> list[dict[str, Any]]:
        body = {"targetIds": list(target_ids), "limit": limit}
        response = self.client.request(
            "POST",
            "launcher/site-submissions/claim",
            json={**body, "capabilities": list(WORKER_CAPABILITIES)},
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

    def waiting(self) -> list[dict[str, Any]]:
        return _items(
            self.client.request("GET", "manual-submissions", retryable=True), "Manual submission list"
        )

    def site_configuration(self, target_id: str) -> ManualSiteConfiguration:
        return ManualSiteConfiguration.parse(
            self.client.request("GET", f"manual-submissions/sites/{path_id(target_id)}", retryable=True)
        )

    def claim(self, target_id: str, *, limit: int, all_jobs: bool) -> list[dict[str, Any]]:
        """`all_jobs`なら、自分が所有するコンピュータで待つJobを、自分のものに限らずすべて取る。"""
        body = {"targetId": target_id, "submitterId": self.submitter_id, "limit": limit, "all": all_jobs}
        response = self.client.request(
            "POST", "manual-submissions/claim", json={**body, "capabilities": list(WORKER_CAPABILITIES)}
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
