"""The worker's loop for connection checks and directory listings: claims, parallel runs, old APIs."""

from __future__ import annotations

import asyncio
import json
import sys
from collections.abc import Awaitable, Callable
from pathlib import Path
from typing import Any
from uuid import uuid4

import httpx
import pytest

from mado_tracking.errors import ConfigurationError
from mado_tracking.settings import ApiSettings
from mado_tracking.worker import target_check_runner
from mado_tracking.worker.api import WorkerApi
from mado_tracking.worker.config import WorkerSettings
from mado_tracking.worker.service import Worker
from mado_tracking.worker.target_check_claims import parse_claimed_target_check
from mado_tracking.worker.target_probe import failed_result

API_TOKEN = "mmt_test-worker-secret-value"
WORKER_ID = "probe-worker"
# A missing completion must fail the test instead of hanging it.
SCENARIO_TIMEOUT_SECONDS = 20
# Idle Job claims that show the loop went round without claiming a check.
IDLE_ITERATIONS = 5

ClaimAnswer = dict[str, Any] | None


@pytest.fixture(autouse=True)
def fast_target_check_polls(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(target_check_runner, "TARGET_CHECK_POLL_SECONDS", 0.01)


def local_target(tmp_path: Path) -> dict[str, Any]:
    return {
        "id": str(uuid4()),
        "executor": "local",
        "workDirectory": str(tmp_path / "work"),
        "pythonExecutable": sys.executable,
        "gpuIds": [],
        "sshKeyPath": "",
        "knownHostsPath": "",
    }


def claimed_check(
    target: dict[str, Any],
    *,
    kind: str | None = "connection",
    directory_path: str | None = None,
    assigned: bool = True,
) -> dict[str, Any]:
    """A WorkerTargetCheck; kind=None is the response of an API from before directory listings."""
    check = {"id": str(uuid4()), "targetId": target["id"]}
    if kind is not None:
        check["assignedWorker"] = {"tokenId": str(uuid4()), "workerId": WORKER_ID} if assigned else None
    item = {"check": check, "leaseId": str(uuid4()), "target": target}
    if kind is not None:
        item.update(kind=kind, directoryPath=directory_path)
    return item


class TargetCheckServer:
    """Hands out the scripted claim answers in turn, then nothing; records every report."""

    def __init__(
        self,
        answers: list[ClaimAnswer | Callable[[dict[str, Any]], ClaimAnswer]],
        *,
        refuses_kinds: bool = False,
        claim_status: int = 200,
    ):
        self.answers = list(answers)
        self.refuses_kinds = refuses_kinds
        self.claim_status = claim_status
        self.claims: list[dict[str, Any]] = []
        self.completions: list[tuple[str, dict[str, Any]]] = []
        self.job_claims = 0
        self.changed = asyncio.Event()

    def serve(self, request: httpx.Request) -> httpx.Response:
        body = json.loads(request.content)
        path = request.url.path
        self.changed.set()
        if path.endswith("/worker/target-checks/claim"):
            self.claims.append(body)
            if self.claim_status != 200:
                return httpx.Response(self.claim_status, json={"error": "scripted"})
            if self.refuses_kinds and "kinds" in body:
                return httpx.Response(422, json={"error": "Unrecognized keys: kinds, activeCheckIds"})
            answer = self.answers.pop(0) if self.answers else None
            item = answer(body) if callable(answer) else answer
            return httpx.Response(200, json={"item": item})
        if "/worker/target-checks/" in path and path.endswith("/complete"):
            self.completions.append((path.split("/")[-2], body))
            return httpx.Response(200, json={})
        if path.endswith("/resume"):
            return httpx.Response(200, json={"items": []})
        self.job_claims += 1
        return httpx.Response(200, json={"item": None})

    def completion_of(self, check_id: str) -> dict[str, Any] | None:
        return next((body for completed_id, body in self.completions if completed_id == check_id), None)

    async def wait_for(self, condition: Callable[[], bool]) -> None:
        while not condition():
            self.changed.clear()
            await self.changed.wait()


def worker_for(server: TargetCheckServer, tmp_path: Path, target_ids: tuple[str, ...] = ()) -> Worker:
    settings = WorkerSettings(
        api=ApiSettings("http://localhost/api", API_TOKEN),
        worker_id=WORKER_ID,
        target_ids=target_ids,
        state_directory=tmp_path / "state",
        allow_local_executor=True,
        poll_seconds=0.01,
    )
    api = WorkerApi(url=settings.api.url, token=API_TOKEN, transport=httpx.MockTransport(server.serve))
    return Worker(settings, api=api)


def run_until(worker: Worker, scenario: Callable[[], Awaitable[None]]) -> None:
    async def run() -> None:
        task = asyncio.create_task(worker.run_forever())
        try:
            async with asyncio.timeout(SCENARIO_TIMEOUT_SECONDS):
                await scenario()
        finally:
            worker.stopping.set()
            await task

    asyncio.run(run())


class GatedCheck:
    """Stands in for check_target: each check waits until the test releases it."""

    def __init__(self) -> None:
        self.started: list[str] = []
        self.release = asyncio.Event()

    async def __call__(self, target: dict[str, Any], **_keywords: Any) -> tuple[str, dict[str, Any]]:
        self.started.append(target["id"])
        await self.release.wait()
        return "finished", failed_result("connection", "ssh_failed")


def test_worker_without_target_ids_claims_a_check_assigned_to_it_and_reports_version_2(tmp_path: Path):
    target = local_target(tmp_path)
    item = claimed_check(target)
    server = TargetCheckServer([item])
    worker = worker_for(server, tmp_path)
    run_until(worker, lambda: server.wait_for(lambda: bool(server.completions)))
    assert server.claims[0] == {
        "workerId": WORKER_ID,
        "targetIds": [],
        "kinds": ["connection", "directory_listing"],
        "activeCheckIds": [],
    }
    completion = server.completion_of(item["check"]["id"])
    assert completion is not None
    assert completion["leaseId"] == item["leaseId"] and completion["status"] == "finished"
    result = completion["result"]
    assert result["version"] == 2
    assert {entry["name"]: entry["status"] for entry in result["items"]}["python"] == "ok"
    assert result["directories"][0]["source"] == "home"
    assert API_TOKEN not in json.dumps(completion)


def test_listing_runs_beside_a_running_check_and_is_claimed_with_the_running_check_ids(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
):
    gated = GatedCheck()
    monkeypatch.setattr(target_check_runner, "check_target", gated)
    (tmp_path / "data" / "runs").mkdir(parents=True)
    connection = claimed_check(local_target(tmp_path))
    listing = claimed_check(
        local_target(tmp_path), kind="directory_listing", directory_path=str(tmp_path / "data")
    )
    server = TargetCheckServer([connection, listing])
    worker = worker_for(server, tmp_path)
    connection_id, listing_id = connection["check"]["id"], listing["check"]["id"]

    async def scenario() -> None:
        await server.wait_for(lambda: server.completion_of(listing_id) is not None)
        gated.release.set()
        await server.wait_for(lambda: server.completion_of(connection_id) is not None)

    run_until(worker, scenario)
    assert server.claims[1]["activeCheckIds"] == [connection_id]
    assert [check_id for check_id, _ in server.completions] == [listing_id, connection_id]
    listed = server.completion_of(listing_id)
    assert listed is not None and listed["status"] == "finished"
    assert listed["result"] == {
        "path": str(tmp_path / "data"),
        "outcome": "ok",
        "entries": [{"name": "runs", "kind": "directory", "executable": False}],
        "truncated": False,
    }


def test_check_the_api_hands_back_while_it_runs_is_not_started_twice(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
):
    gated = GatedCheck()
    monkeypatch.setattr(target_check_runner, "check_target", gated)
    item = claimed_check(local_target(tmp_path))
    check_id = item["check"]["id"]
    server = TargetCheckServer([])
    server.answers = [lambda _body: item if server.completion_of(check_id) is None else None] * 50
    worker = worker_for(server, tmp_path)

    async def scenario() -> None:
        await server.wait_for(lambda: len(server.claims) >= 3)
        gated.release.set()
        await server.wait_for(lambda: server.completion_of(check_id) is not None)

    run_until(worker, scenario)
    assert gated.started == [item["target"]["id"]]
    assert len(server.completions) == 1


def test_old_api_refusing_kinds_is_asked_in_its_own_form_one_check_at_a_time_with_version_1(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
):
    gated = GatedCheck()
    monkeypatch.setattr(target_check_runner, "check_target", gated)
    target = local_target(tmp_path)
    item = claimed_check(target, kind=None)
    server = TargetCheckServer([item, claimed_check(target, kind=None)], refuses_kinds=True)
    worker = worker_for(server, tmp_path, (target["id"],))
    claims_while_running: list[int] = []

    async def scenario() -> None:
        await server.wait_for(lambda: bool(gated.started))
        job_claims = server.job_claims
        await server.wait_for(lambda: server.job_claims >= job_claims + IDLE_ITERATIONS)
        claims_while_running.append(len(server.claims))
        gated.release.set()
        await server.wait_for(lambda: server.completion_of(item["check"]["id"]) is not None)

    run_until(worker, scenario)
    assert server.claims[0]["kinds"] == ["connection", "directory_listing"]
    assert server.claims[1] == {"workerId": WORKER_ID, "targetIds": [target["id"]]}
    # While the first check ran, the old API was not asked for another (it has one more queued).
    assert claims_while_running == [2]
    completion = server.completion_of(item["check"]["id"])
    assert completion is not None
    assert completion["result"]["version"] == 1
    assert "host" not in completion["result"] and "pythons" not in completion["result"]


def test_old_api_refusing_kinds_is_not_asked_again_by_a_worker_without_target_ids(tmp_path: Path):
    server = TargetCheckServer([], refuses_kinds=True)
    worker = worker_for(server, tmp_path)
    run_until(worker, lambda: server.wait_for(lambda: server.job_claims >= IDLE_ITERATIONS))
    assert len(server.claims) == 1 and "kinds" in server.claims[0]


def test_claim_response_without_kind_gets_a_version_1_result(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    async def finished_check(_target: dict[str, Any], **_keywords: Any) -> tuple[str, dict[str, Any]]:
        return "finished", failed_result("connection", "ssh_failed")

    monkeypatch.setattr(target_check_runner, "check_target", finished_check)
    target = local_target(tmp_path)
    item = claimed_check(target, kind=None)
    server = TargetCheckServer([item])
    worker = worker_for(server, tmp_path, (target["id"],))
    run_until(worker, lambda: server.wait_for(lambda: bool(server.completions)))
    assert "kinds" in server.claims[0]
    [(_, completion)] = server.completions
    assert completion["result"]["version"] == 1 and "directories" not in completion["result"]


def test_api_without_target_checks_is_not_asked_again(tmp_path: Path):
    server = TargetCheckServer([], claim_status=404)
    worker = worker_for(server, tmp_path)
    run_until(worker, lambda: server.wait_for(lambda: server.job_claims >= IDLE_ITERATIONS))
    assert len(server.claims) == 1


def test_claim_of_a_computer_neither_assigned_to_the_worker_nor_in_its_target_ids_is_refused(tmp_path: Path):
    target = local_target(tmp_path)
    unassigned = claimed_check(target, assigned=False)
    assigned_elsewhere = claimed_check(target)
    assigned_elsewhere["check"]["assignedWorker"]["workerId"] = "other-worker"
    for item in (unassigned, assigned_elsewhere, claimed_check(target, kind=None)):
        with pytest.raises(ConfigurationError):
            parse_claimed_target_check(item, worker_id=WORKER_ID, target_ids=())
    # The same requests are this worker's when the computer is one of its targets.
    for item in (unassigned, assigned_elsewhere):
        claimed = parse_claimed_target_check(item, worker_id=WORKER_ID, target_ids=(target["id"],))
        assert claimed is not None and claimed.result_version == 2


def test_listing_claim_without_a_directory_or_with_an_unknown_kind_is_refused(tmp_path: Path):
    target = local_target(tmp_path)
    for item in (
        claimed_check(target, kind="directory_listing", directory_path=None),
        claimed_check(target, kind="benchmark"),
    ):
        with pytest.raises(ConfigurationError):
            parse_claimed_target_check(item, worker_id=WORKER_ID, target_ids=())


def test_rejected_claim_runs_nothing(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    gated = GatedCheck()
    monkeypatch.setattr(target_check_runner, "check_target", gated)
    server = TargetCheckServer([claimed_check(local_target(tmp_path), assigned=False)])
    worker = worker_for(server, tmp_path)
    run_until(worker, lambda: server.wait_for(lambda: server.job_claims >= IDLE_ITERATIONS))
    assert gated.started == [] and server.completions == []
