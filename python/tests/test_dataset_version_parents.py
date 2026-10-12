"""Dataset parent corrections retain the existing version and training configuration."""

import json

import httpx
import pytest

from mado_tracking import Client, ConfigurationError


def recording_client():
    requests = []

    def serve(request):
        body = json.loads(request.content) if request.content else None
        requests.append((request.method, request.url.path, body))
        return httpx.Response(
            200,
            json={"registeredParentDatasetVersionIds": [], "parentDatasetVersionIds": ["audio"], "items": []},
        )

    return Client(
        api_url="http://localhost", api_token="synthetic-test-token", transport=httpx.MockTransport(serve)
    ), requests


def test_parent_correction_uses_the_existing_version_without_changing_runs_or_content():
    client, requests = recording_client()
    with client:
        history = client.add_dataset_version_parents(
            "project",
            "dataset",
            "existing-version",
            parent_dataset_version_ids=["audio"],
            reason="Verified the saved recipe",
            evidence={"archives": 32},
        )
        assert client.dataset_version_parents("project", "dataset", "existing-version") == history
    assert requests == [
        (
            "POST",
            "/api/projects/project/datasets/dataset/versions/existing-version/parents",
            {
                "parentDatasetVersionIds": ["audio"],
                "reason": "Verified the saved recipe",
                "evidence": {"archives": 32},
            },
        ),
        ("GET", "/api/projects/project/datasets/dataset/versions/existing-version/parents", None),
    ]


@pytest.mark.parametrize(
    "parents,reason,evidence",
    [
        ([], "Verified", {"archives": 32}),
        (["a", "a"], "Verified", {"archives": 32}),
        (["a"], " ", {"archives": 32}),
        (["a"], "Verified", {}),
        (["a"], "Verified", {"value": float("nan")}),
    ],
)
def test_invalid_parent_evidence_is_not_sent(parents, reason, evidence):
    client, requests = recording_client()
    with client, pytest.raises(ConfigurationError):
        client.add_dataset_version_parents(
            "project",
            "dataset",
            "version",
            parent_dataset_version_ids=parents,
            reason=reason,
            evidence=evidence,
        )
    assert requests == []
