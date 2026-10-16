from __future__ import annotations

import json
from collections.abc import Callable
from pathlib import Path
from typing import Any

import httpx
import pytest
from execution_fixtures import pin_execution
from test_sdk_registry_features import paged_responder, recording_client

from mado_tracking import ConfigurationError
from mado_tracking.offline import start_offline_run
from mado_tracking.run import Run
from mado_tracking.worker import host_runner
from mado_tracking.worker.container_layout import container_environment, prepare_container_layout
from mado_tracking.worker.contracts import WorkerJob
from mado_tracking.worker.runtime import execution_specification
from mado_tracking.worker.workflow_context import DATASET_USAGE_FILENAME

RUNTIMES = ["python", "docker", "apptainer"]
WORKFLOW_VARIABLES = {"MMT_DATASET_USAGE_FILE", "MMT_WORKFLOW_EXECUTION_ID"}


def busy_once(
    response: httpx.Response,
) -> tuple[list[httpx.Request], Callable[[httpx.Request], httpx.Response]]:
    """A responder that answers 503 to the first request and `response` to the rest."""
    attempts: list[httpx.Request] = []

    def respond(request: httpx.Request) -> httpx.Response:
        attempts.append(request)
        if len(attempts) == 1:
            return httpx.Response(503, headers={"retry-after": "0"}, json={"error": "busy"})
        return response

    return attempts, respond


def test_workflow_resume_is_sent_again_with_the_same_key_and_source_after_a_503():
    attempts, respond = busy_once(httpx.Response(201, json={"id": "execution-2"}))
    client, _ = recording_client(respond)
    with client:
        execution = client.launch_workflow("p", "w", revision=2, resume_from_execution_id="execution-1")
    assert execution["id"] == "execution-2"
    bodies = [json.loads(request.content) for request in attempts]
    assert len(bodies) == 2 and bodies[0] == bodies[1]
    assert bodies[0]["resumeFromExecutionId"] == "execution-1"


@pytest.mark.parametrize(
    ("read", "path"),
    [
        (lambda client: client.get_workflow("p", "w"), "/api/projects/p/workflows/w"),
        (lambda client: client.get_workflow_execution("p", "e"), "/api/projects/p/workflow-executions/e"),
    ],
    ids=["workflow", "execution"],
)
def test_workflow_reads_are_retried_after_a_503_so_a_wait_loop_survives_it(read, path):
    attempts, respond = busy_once(httpx.Response(200, json={"id": "read"}))
    client, requests = recording_client(respond)
    with client:
        assert read(client)["id"] == "read"
    assert [request[:2] for request in requests] == [("GET", path)] * 2


def test_workflow_versions_are_listed_newest_first_across_cursor_pages():
    client, requests = recording_client(
        paged_responder(
            [
                {"items": [{"revision": 3}, {"revision": 2}], "nextCursor": "version-2"},
                {"items": [{"revision": 1}], "nextCursor": None},
            ]
        )
    )
    with client:
        revisions = [version["revision"] for version in client.list_workflow_versions("p", "w")]
    assert revisions == [3, 2, 1]
    assert [request[:3] for request in requests] == [
        ("GET", "/api/projects/p/workflows/w/versions", {}),
        ("GET", "/api/projects/p/workflows/w/versions", {"cursor": "version-2"}),
    ]


def test_workflow_history_follows_cursor_pages():
    client, requests = recording_client(
        paged_responder(
            [
                {"items": [{"id": "e1"}], "nextCursor": "e1"},
                {"items": [{"id": "e2"}], "nextCursor": None},
            ]
        )
    )
    with client:
        assert [item["id"] for item in client.list_workflow_executions("p", "w")] == ["e1", "e2"]
    assert requests[1][2] == {"cursor": "e1"}


def test_preprocessing_report_preserves_reasons_metrics_and_sample_ids():
    client, requests = recording_client()
    with client:
        run = Run(client, "p", {"id": "r", "kind": "processing"})
        run.log_preprocessing_report(
            input_count=10,
            output_count=12,
            excluded_count=2,
            exclusions=[{"reason": "short", "count": 2}],
            metrics={"snr": 20},
            sample_artifact_ids=["sample"],
        )
    method, path, _, body = requests[0]
    assert method == "PUT" and path.endswith("/runs/r/preprocessing-report")
    assert body["exclusions"] == [{"reason": "short", "count": 2}]
    assert body["outputCount"] == 12 and body["metrics"] == {"snr": 20}
    assert body["sampleArtifactIds"] == ["sample"]


def test_an_offline_run_cannot_log_a_preprocessing_report_and_sends_nothing(tmp_path):
    offline = start_offline_run(
        project_id="p",
        experiment_id="e",
        name="offline",
        kind="processing",
        attributes={},
        offline_directory=tmp_path,
    )
    with pytest.raises(ConfigurationError, match="needs the API"):
        offline.log_preprocessing_report(input_count=1, output_count=1)
    # mode="auto" keeps its client after switching to the spool; the report is still not sent.
    client, requests = recording_client()
    with client:
        switched = Run(client, "p", offline.entity, transport=offline.transport)
        with pytest.raises(ConfigurationError, match="needs the API"):
            switched.log_preprocessing_report(input_count=1, output_count=1)
    assert requests == []


def test_preprocessing_report_rejects_nonfinite_values_before_http():
    client, requests = recording_client()
    with client, pytest.raises(ConfigurationError, match="finite JSON"):
        Run(client, "p", {"id": "r"}).log_preprocessing_report(
            input_count=0, output_count=0, metrics={"snr": float("nan")}
        )
    assert requests == []


def prepared_runtime(
    job_payload: dict[str, Any], worker_settings: Any, workspace: Path, runtime: str
) -> tuple[dict[str, str], Path]:
    """The variables a Job gets on `runtime`, and where its dataset usage file would be on the host."""
    if runtime != "python":
        job_payload["target"]["runtimeKinds"] = [runtime]
        job_payload["codeVersion"].update(
            source=None,
            runtime={
                "kind": runtime,
                **(
                    {"image": "example.invalid/image@sha256:" + "1" * 64}
                    if runtime == "docker"
                    else {"artifactId": "12345678-1234-1234-1234-123456789abc", "sha256": "1" * 64}
                ),
            },
            entrypoint=["/bin/true"],
        )
    specification = execution_specification(WorkerJob.parse(pin_execution(job_payload)), worker_settings)
    specification["stagedInputs"] = {"datasets": {}}
    if runtime == "python":
        specification["executionSnapshot"] = {"mode": "run"}
        environment = host_runner._execution_environment(specification, workspace)
        return environment, workspace / DATASET_USAGE_FILENAME
    prepare_container_layout(workspace, specification)
    return container_environment(specification), workspace / "context" / DATASET_USAGE_FILENAME


@pytest.mark.parametrize("runtime", RUNTIMES)
def test_every_runtime_receives_pinned_usage_and_workflow_identity(
    job_payload, worker_settings, tmp_path, runtime
):
    usage = [{"datasetVersionId": "v", "role": "training", "weight": 2, "selection": {"seed": 42}}]
    job_payload["run"]["environment"] = {"datasetUsage": usage, "workflow": {"executionId": "e"}}
    environment, usage_file = prepared_runtime(job_payload, worker_settings, tmp_path, runtime)
    expected_file = str(usage_file) if runtime == "python" else "/mmt/context/dataset-usage.json"
    assert environment["MMT_DATASET_USAGE_FILE"] == expected_file
    assert json.loads(usage_file.read_text()) == {"items": usage}
    assert environment["MMT_WORKFLOW_EXECUTION_ID"] == "e"


@pytest.mark.parametrize("runtime", RUNTIMES)
def test_Workflowに属さないJobにはWorkflowの環境変数を渡さない(
    job_payload, worker_settings, tmp_path, runtime
):
    job_payload["run"]["environment"] = {}
    environment, usage_file = prepared_runtime(job_payload, worker_settings, tmp_path, runtime)
    assert not WORKFLOW_VARIABLES & set(environment)
    assert not usage_file.exists()


@pytest.mark.parametrize("runtime", RUNTIMES)
def test_an_empty_dataset_usage_is_written_as_an_empty_item_list(
    job_payload, worker_settings, tmp_path, runtime
):
    job_payload["run"]["environment"] = {"datasetUsage": []}
    environment, usage_file = prepared_runtime(job_payload, worker_settings, tmp_path, runtime)
    assert "MMT_DATASET_USAGE_FILE" in environment
    assert json.loads(usage_file.read_text()) == {"items": []}


@pytest.mark.parametrize("runtime", RUNTIMES)
def test_a_workflow_step_without_dataset_usage_still_gets_its_execution_id(
    job_payload, worker_settings, tmp_path, runtime
):
    job_payload["run"]["environment"] = {"workflow": {"executionId": "e"}}
    environment, usage_file = prepared_runtime(job_payload, worker_settings, tmp_path, runtime)
    assert environment["MMT_WORKFLOW_EXECUTION_ID"] == "e"
    assert "MMT_DATASET_USAGE_FILE" not in environment
    assert not usage_file.exists()


@pytest.mark.parametrize(
    "run_environment",
    [
        {"datasetUsage": {"items": []}, "workflow": ["e"]},
        {"datasetUsage": "v", "workflow": {"executionId": 7}},
        ["datasetUsage", "workflow"],
    ],
    ids=["usage-object-workflow-list", "usage-text-numeric-execution-id", "environment-list"],
)
def test_dataset_usage_and_workflow_of_another_type_are_ignored(
    job_payload, worker_settings, tmp_path, run_environment
):
    job_payload["run"]["environment"] = run_environment
    environment, usage_file = prepared_runtime(job_payload, worker_settings, tmp_path, "python")
    assert not WORKFLOW_VARIABLES & set(environment)
    assert not usage_file.exists()
