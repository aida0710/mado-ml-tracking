from __future__ import annotations

import json
from pathlib import Path

import pytest
from test_sdk_registry_features import paged_responder, recording_client

from mado_tracking import ConfigurationError
from mado_tracking.run import Run
from mado_tracking.worker import host_runner
from mado_tracking.worker.container_layout import container_environment, prepare_container_layout
from mado_tracking.worker.contracts import WorkerJob
from mado_tracking.worker.runtime import execution_specification


def test_workflow_resume_retries_with_the_same_key_after_acceptance():
    import httpx

    attempts = []

    def respond(request):
        attempts.append(json.loads(request.content))
        if len(attempts) == 1:
            return httpx.Response(503, headers={"retry-after": "0"}, json={"error": "busy"})
        return httpx.Response(201, json={"id": "execution-2"})

    client, _ = recording_client(respond)
    with client:
        execution = client.launch_workflow("p", "w", revision=2, resume_from_execution_id="execution-1")
    assert execution["id"] == "execution-2"
    assert len(attempts) == 2 and attempts[0] == attempts[1]
    assert attempts[0]["resumeFromExecutionId"] == "execution-1"


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


def test_preprocessing_report_rejects_nonfinite_values_before_http():
    client, requests = recording_client()
    with client, pytest.raises(ConfigurationError, match="finite JSON"):
        Run(client, "p", {"id": "r"}).log_preprocessing_report(
            input_count=0, output_count=0, metrics={"snr": float("nan")}
        )
    assert requests == []


@pytest.mark.parametrize("runtime", ["python", "docker", "apptainer"])
def test_every_runtime_receives_pinned_usage_and_workflow_identity(
    job_payload, worker_settings, tmp_path, runtime
):
    usage = [{"datasetVersionId": "v", "role": "training", "weight": 2, "selection": {"seed": 42}}]
    job_payload["run"]["environment"] = {"datasetUsage": usage, "workflow": {"executionId": "e"}}
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
    specification = execution_specification(WorkerJob.parse(job_payload), worker_settings)
    if runtime == "python":
        specification["executionSnapshot"] = {"mode": "run"}
        environment = host_runner._execution_environment(specification, tmp_path)
        document = Path(environment["MMT_DATASET_USAGE_FILE"])
    else:
        prepare_container_layout(tmp_path, specification)
        environment = container_environment(specification)
        assert environment["MMT_DATASET_USAGE_FILE"] == "/mmt/context/dataset-usage.json"
        document = tmp_path / "context/dataset-usage.json"
    assert json.loads(document.read_text()) == {"items": usage}
    assert environment["MMT_WORKFLOW_EXECUTION_ID"] == "e"
