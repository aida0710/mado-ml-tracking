"""SDKは実際の学習の入力を記録し、取り込んだモデルバージョンの識別情報を保つ。"""

import json

import httpx
import pytest

from mado_tracking import Client, ConfigurationError
from mado_tracking.run import Run


def recording_client():
    requests = []

    def serve(request):
        body = json.loads(request.content) if request.content else None
        requests.append((request.method, request.url.path, body))
        if request.method == "GET":
            return httpx.Response(
                200, json={"initialStep": 0, "initialDatasetVersionIds": ["original"], "items": []}
            )
        return httpx.Response(200, json={"id": "recorded", **body})

    return Client(
        api_url="http://localhost", api_token="synthetic-test-token", transport=httpx.MockTransport(serve)
    ), requests


def test_recording_new_data_keeps_the_original_run_configuration():
    client, requests = recording_client()
    with client:
        run = Run(
            client,
            "project",
            {"id": "pretraining", "kind": "training", "inputDatasetVersionIds": ["original"]},
        )
        stage = run.log_training_data_stage(
            start_step=1001,
            input_dataset_version_ids=["original", "synthetic"],
            checkpoint_id="checkpoint-1000",
            metadata={"mixture": {"original": 1, "synthetic": 0.5}},
        )
        history = run.training_data_stages()
    assert stage["startStep"] == 1001
    assert run.entity["inputDatasetVersionIds"] == ["original"]
    assert history["initialDatasetVersionIds"] == ["original"]
    assert requests[0] == (
        "POST",
        "/api/projects/project/runs/pretraining/training-data-stages",
        {
            "startStep": 1001,
            "inputDatasetVersionIds": ["original", "synthetic"],
            "checkpointId": "checkpoint-1000",
            "metadata": {"mixture": {"original": 1, "synthetic": 0.5}},
        },
    )


@pytest.mark.parametrize(
    "kind,step,versions",
    [("inference", 1, ["a"]), ("training", -1, ["a"]), ("training", 1, []), ("training", 1, ["a", "a"])],
)
def test_invalid_training_data_never_reaches_the_api(kind, step, versions):
    client, requests = recording_client()
    with client:
        run = Run(client, "project", {"id": "run", "kind": kind})
        with pytest.raises((ConfigurationError, ValueError)):
            run.log_training_data_stage(start_step=step, input_dataset_version_ids=versions)
    assert requests == []


def test_associating_a_registered_version_sends_no_new_weights_or_version_creation():
    client, requests = recording_client()
    with client:
        source = client.associate_model_training_source(
            "project", "model", "existing-version", run_id="past-run", evidence={"recipe": "recipe.json"}
        )
    assert source["runId"] == "past-run"
    assert requests == [
        (
            "POST",
            "/api/projects/project/models/model/versions/existing-version/training-source",
            {"runId": "past-run", "evidence": {"recipe": "recipe.json"}},
        )
    ]


def test_historical_training_uses_exact_datasets_and_does_not_invent_dates():
    client, requests = recording_client()
    with client:
        client.associate_model_training_source(
            "project",
            "model",
            "version",
            historical_run={
                "experimentId": "experiment",
                "name": "Past pretraining",
                "kind": "training",
                "inputDatasetVersionIds": ["verified-dataset-version"],
            },
        )
    assert requests[0][2]["run"]["inputDatasetVersionIds"] == ["verified-dataset-version"]
    assert "startedAt" not in requests[0][2]["run"]
    assert "endedAt" not in requests[0][2]["run"]
    with pytest.raises(ConfigurationError):
        client.associate_model_training_source("project", "model", "version", run_id="run", historical_run={})


def test_nonfinite_metadata_is_refused_before_it_is_sent():
    client, requests = recording_client()
    with client:
        run = Run(client, "project", {"id": "run", "kind": "training"})
        with pytest.raises(ConfigurationError):
            run.log_training_data_stage(
                start_step=1, input_dataset_version_ids=["a"], metadata={"loss": float("nan")}
            )
    assert requests == []
