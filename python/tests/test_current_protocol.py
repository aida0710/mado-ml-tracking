import copy
import hashlib
import json
from uuid import uuid4

import pytest

from mado_tracking import Client, ConfigurationError
from mado_tracking.worker.container_outputs import validate_output_summary
from mado_tracking.worker.contracts import WorkerJob
from mado_tracking.worker.host_runner import launch
from mado_tracking.worker.host_state import write_json
from mado_tracking.worker.runtime import execution_specification


@pytest.mark.parametrize(
    "section,field",
    [
        ("run", "runtime"),
        ("codeVersion", "runtime"),
        ("target", "runtimeKinds"),
        ("target", "datasetCacheMaxBytes"),
        ("target", "datasetTransfer"),
    ],
)
def test_実行に必須の項目が欠損するとJobを拒否する(job_payload, section, field):
    del job_payload[section][field]
    with pytest.raises(ConfigurationError):
        WorkerJob.parse(job_payload)


def test_DatasetのcontentKindが欠損するとJobを拒否する(job_payload):
    version_id = str(uuid4())
    job_payload["run"]["inputDatasetVersionIds"] = [version_id]
    job_payload["inputDatasets"] = [
        {"id": version_id, "projectId": job_payload["job"]["projectId"], "uri": "urn:data", "digest": "data"}
    ]
    with pytest.raises(ConfigurationError, match="contentKind"):
        WorkerJob.parse(job_payload)


def test_register_modelのname引数を送るとAPIへ接続せず拒否する():
    with Client(api_url="http://api.invalid", api_token="synthetic-test-token") as client:
        with pytest.raises(TypeError, match="name"):
            client.register_model("project", name="model")


@pytest.mark.parametrize("missing", ["artifactCount", "artifactIndexSha256"])
def test_出力indexの必須項目がないと空の結果でも拒否する(missing):
    summary = {"artifactCount": 0, "artifactIndexSha256": hashlib.sha256(b"").hexdigest()}
    del summary[missing]
    with pytest.raises(ValueError, match=missing):
        validate_output_summary(summary)


def test_inline形式のArtifactはindexがあっても拒否する():
    with pytest.raises(ValueError, match="inline artifacts"):
        validate_output_summary(
            {"artifacts": [], "artifactCount": 0, "artifactIndexSha256": hashlib.sha256(b"").hexdigest()}
        )


@pytest.mark.parametrize("missing", ["executionMode", "runId", "instructionsHash"])
def test_実行を特定する項目がstateに欠損すると再開を拒否する(worker_job, worker_settings, tmp_path, missing):
    specification = execution_specification(worker_job, worker_settings)
    snapshot = worker_job.execution_snapshot
    state = {
        "jobId": worker_job.id,
        "codeVersionId": worker_job.code_version["id"],
        "leaseId": worker_job.lease_id,
        "executionMode": snapshot["mode"],
        "runId": worker_job.run["id"],
        "instructionsHash": hashlib.sha256(
            json.dumps(snapshot, sort_keys=True, allow_nan=False).encode()
        ).hexdigest(),
    }
    del state[missing]
    write_json(tmp_path / "state.json", state)
    with pytest.raises(ValueError, match="different pinned job"):
        launch(tmp_path, copy.deepcopy(specification), tmp_path / "unused-runtime")
