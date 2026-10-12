"""What the worker reports in workerInfo on claim and resume, and older APIs that refuse its fields."""

from __future__ import annotations

import asyncio
import json
import logging
from collections.abc import Collection, Sequence
from pathlib import Path
from typing import Any

import httpx
import pytest

from mado_tracking.errors import ApiError
from mado_tracking.worker.api import WorkerApi

API_TOKEN = "test-api-secret"
# The API refuses a field its strict schema does not know without naming the field
# (apps/api/src/http/request.ts reports only the path of the object that holds it).
UNKNOWN_FIELD_REFUSAL = {"error": "入力が不正です: workerInfo", "code": "invalid_request"}
# The workerInfo fields an older API may not know; the rest describe the host.
OPTIONAL_FIELDS = {"capabilities", "sshFiles"}
# An API from before computer setup knows neither; one from before workflows knows sshFiles.
FIELDS_UNKNOWN_BEFORE_COMPUTER_SETUP = {"capabilities", "sshFiles"}
FIELDS_UNKNOWN_BEFORE_WORKFLOWS = {"capabilities"}


class PresenceServer:
    """Answers claim and resume; an older API refuses workerInfo with a field it does not know."""

    def __init__(self, *, unknown_fields: Collection[str] = ()):
        self.unknown_fields = frozenset(unknown_fields)
        self.requests: list[tuple[str, dict[str, Any]]] = []

    def serve(self, request: httpx.Request) -> httpx.Response:
        body = json.loads(request.content)
        endpoint = request.url.path.rsplit("/", 1)[-1]
        self.requests.append((endpoint, body))
        if self.unknown_fields & set(body.get("workerInfo", {})):
            return httpx.Response(422, json=UNKNOWN_FIELD_REFUSAL)
        return httpx.Response(200, json={"item": None} if endpoint == "claim" else {"items": []})

    def reported_fields(self) -> list[tuple[str, set[str]]]:
        """Each request's endpoint and the optional workerInfo fields it carried."""
        return [(endpoint, set(body["workerInfo"]) & OPTIONAL_FIELDS) for endpoint, body in self.requests]


def run_presence(server: PresenceServer, *, ssh_directories: Sequence[Path] = ()) -> None:
    """A worker starting up: resume what it held, then claim once."""

    async def scenario() -> None:
        api = WorkerApi(
            url="http://localhost/api",
            token=API_TOKEN,
            transport=httpx.MockTransport(server.serve),
            ssh_directories=ssh_directories,
        )
        try:
            await api.resume("presence-worker", [])
            assert await api.claim("presence-worker", []) is None
        finally:
            await api.close()

    asyncio.run(scenario())


def warnings_about(caplog: pytest.LogCaptureFixture, text: str) -> int:
    return len([record for record in caplog.records if text in record.getMessage()])


def test_claim_and_resume_report_that_the_worker_passes_dataset_usage_to_workflow_jobs():
    server = PresenceServer()
    run_presence(server)
    assert [(endpoint, body["workerInfo"]["capabilities"]) for endpoint, body in server.requests] == [
        ("resume", ["workflowDatasetUsage"]),
        ("claim", ["workflowDatasetUsage"]),
    ]


def test_api_from_before_workflows_gets_the_request_again_without_capabilities_but_with_ssh_files(
    caplog: pytest.LogCaptureFixture,
):
    server = PresenceServer(unknown_fields=FIELDS_UNKNOWN_BEFORE_WORKFLOWS)
    with caplog.at_level(logging.WARNING):
        run_presence(server)
    assert server.reported_fields() == [
        ("resume", {"capabilities", "sshFiles"}),
        ("resume", {"sshFiles"}),
        ("claim", {"sshFiles"}),
    ]
    # The request sent again is the same apart from workerInfo.
    first, again = server.requests[0][1], server.requests[1][1]
    assert {**first, "workerInfo": {}} == {**again, "workerInfo": {}}
    assert warnings_about(caplog, "capabilities") == 1
    assert warnings_about(caplog, "SSH files") == 0


def test_api_from_before_computer_setup_gets_neither_field_after_refusing_each_once(
    caplog: pytest.LogCaptureFixture,
):
    server = PresenceServer(unknown_fields=FIELDS_UNKNOWN_BEFORE_COMPUTER_SETUP)
    with caplog.at_level(logging.WARNING):
        run_presence(server)
    assert server.reported_fields() == [
        ("resume", {"capabilities", "sshFiles"}),
        ("resume", {"sshFiles"}),
        ("resume", set()),
        ("claim", set()),
    ]
    assert warnings_about(caplog, "capabilities") == 1
    assert warnings_about(caplog, "SSH files") == 1


def test_a_422_for_another_reason_is_raised_once_no_field_is_left_to_drop():
    calls = []

    def refuse_everything(request: httpx.Request) -> httpx.Response:
        calls.append(json.loads(request.content))
        return httpx.Response(422, json={"error": "入力が不正です: targetIds", "code": "invalid_request"})

    async def scenario() -> None:
        api = WorkerApi(
            url="http://localhost/api", token=API_TOKEN, transport=httpx.MockTransport(refuse_everything)
        )
        try:
            for _ in range(2):
                with pytest.raises(ApiError):
                    await api.claim("presence-worker", [])
        finally:
            await api.close()

    asyncio.run(scenario())
    # The first claim drops one field per 422; the second is sent only once.
    assert [set(call["workerInfo"]) & OPTIONAL_FIELDS for call in calls] == [
        {"capabilities", "sshFiles"},
        {"sshFiles"},
        set(),
        set(),
    ]
