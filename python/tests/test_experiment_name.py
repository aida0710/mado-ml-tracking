from __future__ import annotations

import json
from uuid import uuid4

import httpx
import pytest

import mado_tracking
from mado_tracking import ApiError, Client, ConfigurationError, http

PROJECT_ID = str(uuid4())
PROJECT_PATH = f"/api/projects/{PROJECT_ID}"
TOKEN = "experiment-name-test-secret"


class FakeExperimentApi:
    """GET/POST /experiments, POST /runs, PUT /sync/runs/:r and the start PATCH of a Run.

    ``deleted_names`` keep their name in the API (POST answers 409) but are not listed, like an
    MLflow soft-deleted Experiment. ``rival_names`` are created by someone else between this
    client's lookup and its POST. Like the API, a POST saves the name without the white space at
    its ends; ``posted_names`` keeps the names as they were sent.
    """

    def __init__(
        self,
        *,
        experiments: list[dict] | None = None,
        deleted_names: tuple[str, ...] = (),
        rival_names: tuple[str, ...] = (),
        create_status: int | None = None,
    ):
        self.experiments = list(experiments or [])
        self.deleted_names = set(deleted_names)
        self.rival_names = set(rival_names)
        self.create_status = create_status
        self.runs: list[dict] = []
        self.calls: list[tuple[str, str]] = []
        self.posted_names: list[str] = []

    def client(self) -> Client:
        return Client(api_url="http://mmt.test", api_token=TOKEN, transport=httpx.MockTransport(self.handle))

    def handle(self, request: httpx.Request) -> httpx.Response:
        assert request.headers["Authorization"] == f"Bearer {TOKEN}"
        body = json.loads(request.content) if request.content else None
        path = request.url.path.removeprefix(PROJECT_PATH)
        self.calls.append((request.method, path))
        if path == "/experiments" and request.method == "GET":
            return httpx.Response(200, json={"items": self.experiments})
        if path == "/experiments" and request.method == "POST":
            return self.create_experiment(body["name"])
        if path == "/runs" and request.method == "POST":
            run = {"id": str(uuid4()), "status": "queued", **body}
            self.runs.append(run)
            return httpx.Response(201, json=run)
        if path.startswith("/sync/runs/") and request.method == "PUT":
            run = {"id": path.rsplit("/", 1)[1], "status": "running", **body}
            self.runs.append(run)
            return httpx.Response(201, json=run)
        if path.startswith("/runs/") and path.endswith("/resume"):
            return httpx.Response(404, json={"error": "not found", "code": "not_found"})
        if path.startswith("/runs/") and request.method == "PATCH":
            run = next(item for item in self.runs if item["id"] == path.split("/")[2])
            run.update(body)
            return httpx.Response(200, json=run)
        raise AssertionError(f"Unexpected request {request.method} {path}")

    def create_experiment(self, posted_name: str) -> httpx.Response:
        self.posted_names.append(posted_name)
        name = posted_name.strip()
        if self.create_status is not None:
            return httpx.Response(self.create_status, json={"error": "refused", "code": "forbidden"})
        if name in self.rival_names:
            self.experiments.append({"id": "rival-experiment", "name": name})
            return httpx.Response(409, json={"error": "duplicate", "code": "already_exists"})
        if name in self.deleted_names or any(item["name"] == name for item in self.experiments):
            return httpx.Response(409, json={"error": "duplicate", "code": "already_exists"})
        experiment = {"id": str(uuid4()), "name": name}
        self.experiments.append(experiment)
        return httpx.Response(201, json=experiment)

    def experiment_posts(self) -> int:
        return self.calls.count(("POST", "/experiments"))


@pytest.fixture(autouse=True)
def manual_environment(monkeypatch):
    for name in ("MMT_RUN_ID", "MMT_JOB_ID", "MMT_MODE", "MMT_EXPERIMENT_ID", "MMT_PROJECT_ID"):
        monkeypatch.delenv(name, raising=False)


def test_a_run_goes_into_the_experiment_with_that_name_without_creating_one():
    api = FakeExperimentApi(
        experiments=[{"id": "other", "name": "baseline-old"}, {"id": "existing", "name": "baseline"}]
    )

    with api.client() as client:
        run = client.start_run(project_id=PROJECT_ID, experiment_name="baseline", name="lr-0.05")

    assert run.entity["experimentId"] == "existing"
    assert api.experiment_posts() == 0


def test_a_missing_experiment_is_created_once_and_reused_by_the_next_run():
    api = FakeExperimentApi()

    with api.client() as client:
        first = client.start_run(project_id=PROJECT_ID, experiment_name="sweep-a", name="one")
        second = client.start_run(project_id=PROJECT_ID, experiment_name="sweep-a", name="two")

    created = [item for item in api.experiments if item["name"] == "sweep-a"]
    assert len(created) == 1
    assert first.entity["experimentId"] == second.entity["experimentId"] == created[0]["id"]
    assert api.experiment_posts() == 1


def test_a_name_differing_only_in_case_is_another_experiment():
    api = FakeExperimentApi(experiments=[{"id": "upper", "name": "Baseline"}])

    with api.client() as client:
        run = client.start_run(project_id=PROJECT_ID, experiment_name="baseline", name="one")

    assert run.entity["experimentId"] != "upper"
    assert api.experiment_posts() == 1


def test_losing_the_creation_race_uses_the_experiment_the_other_client_created():
    api = FakeExperimentApi(rival_names=("shared",))

    with api.client() as client:
        run = client.start_run(project_id=PROJECT_ID, experiment_name="shared", name="one")

    assert run.entity["experimentId"] == "rival-experiment"
    assert api.calls[:3] == [("GET", "/experiments"), ("POST", "/experiments"), ("GET", "/experiments")]


def test_a_deleted_experiment_with_that_name_is_reported_and_no_run_is_created():
    api = FakeExperimentApi(deleted_names=("archived",))

    with api.client() as client, pytest.raises(ConfigurationError, match="deleted"):
        client.start_run(project_id=PROJECT_ID, experiment_name="archived", name="one")

    assert api.runs == []


def test_a_token_that_may_not_create_experiments_gets_the_api_refusal_and_no_run():
    api = FakeExperimentApi(create_status=403)

    with api.client() as client, pytest.raises(ApiError) as raised:
        client.start_run(project_id=PROJECT_ID, experiment_name="new", name="one")

    assert raised.value.status_code == 403
    assert api.runs == []


def test_giving_both_an_experiment_id_and_a_name_is_refused_before_any_request():
    api = FakeExperimentApi()

    with api.client() as client, pytest.raises(ConfigurationError, match="either experiment_id"):
        client.start_run(project_id=PROJECT_ID, experiment_id="e1", experiment_name="baseline", name="one")

    assert api.calls == []


def test_a_name_in_the_code_wins_over_mmt_experiment_id(monkeypatch):
    monkeypatch.setenv("MMT_EXPERIMENT_ID", "from-environment")
    api = FakeExperimentApi(experiments=[{"id": "named", "name": "baseline"}])

    with api.client() as client:
        named = client.start_run(project_id=PROJECT_ID, experiment_name="baseline", name="one")
        from_environment = client.start_run(project_id=PROJECT_ID, name="two")

    assert named.entity["experimentId"] == "named"
    assert from_environment.entity["experimentId"] == "from-environment"


def test_the_module_start_run_passes_the_name_through(monkeypatch):
    api = FakeExperimentApi(experiments=[{"id": "named", "name": "baseline"}])
    monkeypatch.setattr(mado_tracking, "Client", api.client)

    with mado_tracking.start_run(project_id=PROJECT_ID, experiment_name="baseline", name="one") as run:
        assert run.entity["experimentId"] == "named"


@pytest.mark.parametrize("blank_name", ["", " ", "\u3000", "\t\n"])
def test_a_name_of_only_white_space_is_refused_before_any_request(blank_name):
    api = FakeExperimentApi()

    with api.client() as client, pytest.raises(ConfigurationError, match="must not be empty"):
        client.start_run(project_id=PROJECT_ID, experiment_name=blank_name, name="one")

    assert api.calls == []


def test_a_name_with_spaces_at_its_ends_is_created_once_and_reused_like_the_api_saved_it():
    api = FakeExperimentApi()

    with api.client() as client:
        first = client.start_run(project_id=PROJECT_ID, experiment_name=" sweep-a ", name="one")
        second = client.start_run(project_id=PROJECT_ID, experiment_name="sweep-a ", name="two")

    assert api.posted_names == ["sweep-a"]
    assert [item["name"] for item in api.experiments] == ["sweep-a"]
    assert first.entity["experimentId"] == second.entity["experimentId"] == api.experiments[0]["id"]


def test_a_name_with_a_full_width_space_at_its_end_finds_the_existing_experiment():
    api = FakeExperimentApi(experiments=[{"id": "existing", "name": "音声認識-baseline"}])

    with api.client() as client:
        run = client.start_run(project_id=PROJECT_ID, experiment_name="音声認識-baseline\u3000", name="one")

    assert run.entity["experimentId"] == "existing"
    assert api.experiment_posts() == 0


def test_allow_resume_creates_the_missing_run_in_the_named_experiment():
    api = FakeExperimentApi(experiments=[{"id": "named", "name": "baseline"}])
    run_id = str(uuid4())

    with api.client() as client:
        run = client.start_run(
            project_id=PROJECT_ID, experiment_name="baseline", name="one", run_id=run_id, resume="allow"
        )

    assert run.entity["id"] == run_id
    assert run.entity["experimentId"] == "named"


def test_an_offline_run_refuses_a_name_because_only_the_api_knows_it(tmp_path, monkeypatch):
    monkeypatch.setenv("MMT_OFFLINE_DIR", str(tmp_path))

    with pytest.raises(ConfigurationError, match="experiment_name needs the API"):
        mado_tracking.start_run(project_id=PROJECT_ID, experiment_name="baseline", name="one", mode="offline")

    assert list(tmp_path.iterdir()) == []


def test_auto_mode_says_to_pass_an_id_when_the_api_is_unreachable_for_the_name(monkeypatch):
    monkeypatch.setattr(http, "retry_delay", lambda *_arguments: 0)

    def unreachable(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("API host is unreachable")

    client = Client(api_url="http://mmt.test", api_token=TOKEN, transport=httpx.MockTransport(unreachable))
    with client, pytest.raises(ConfigurationError, match="pass experiment_id to record offline"):
        client.start_run(project_id=PROJECT_ID, experiment_name="baseline", name="one", mode="auto")
