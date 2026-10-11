from __future__ import annotations

import json
from uuid import uuid4

import httpx
import pytest

from mado_tracking import Client, ConfigurationError

PROJECT_ID = str(uuid4())
PROJECT_PATH = f"/api/projects/{PROJECT_ID}"
TOKEN = "model-name-test-secret"


class FakeModelApi:
    """GET/POST /models. Like the API, a POST saves the name and family without the white space at
    their ends, a second POST of the same saved name answers 409, and GET ?name= matches the saved
    name exactly. ``posts`` keeps the bodies as they were sent."""

    def __init__(self) -> None:
        self.models: list[dict] = []
        self.posts: list[dict] = []

    def client(self) -> Client:
        return Client(api_url="http://mmt.test", api_token=TOKEN, transport=httpx.MockTransport(self.handle))

    def handle(self, request: httpx.Request) -> httpx.Response:
        assert request.headers["Authorization"] == f"Bearer {TOKEN}"
        path = request.url.path.removeprefix(PROJECT_PATH)
        if path == "/models" and request.method == "GET":
            name = request.url.params.get("name")
            matches = [model for model in self.models if model["name"] == name]
            return httpx.Response(200, json={"items": matches})
        if path == "/models" and request.method == "POST":
            body = json.loads(request.content)
            self.posts.append(body)
            name, family = body["name"].strip(), body["family"].strip()
            if any(model["name"] == name for model in self.models):
                return httpx.Response(409, json={"error": "conflict", "message": "Model already exists"})
            model = {"id": str(uuid4()), "name": name, "family": family}
            self.models.append(model)
            return httpx.Response(201, json=model)
        return httpx.Response(404, json={"error": "not_found", "message": "Not found"})


def test_a_name_with_spaces_at_its_ends_is_created_once_and_reused_like_the_api_saved_it():
    api = FakeModelApi()
    client = api.client()

    first = client.ensure_model(PROJECT_ID, name="speech-asr ", family=" whisper ")
    second = client.ensure_model(PROJECT_ID, name="speech-asr　", family="whisper")

    assert first["id"] == second["id"]
    assert api.posts == [{"name": "speech-asr", "family": "whisper", "description": ""}]


def test_a_family_with_spaces_at_its_ends_matches_the_saved_family():
    api = FakeModelApi()
    client = api.client()
    client.ensure_model(PROJECT_ID, name="speech-asr", family="whisper")

    model = client.ensure_model(PROJECT_ID, name="speech-asr", family="whisper ")

    assert model["family"] == "whisper"


@pytest.mark.parametrize("blank_name", ["", "   ", "　"])
def test_a_name_of_only_white_space_is_refused_before_any_request(blank_name):
    api = FakeModelApi()

    with pytest.raises(ConfigurationError, match="must not be empty"):
        api.client().ensure_model(PROJECT_ID, name=blank_name, family="whisper")

    assert api.posts == []


def test_another_family_for_an_existing_model_is_still_refused():
    api = FakeModelApi()
    client = api.client()
    client.ensure_model(PROJECT_ID, name="speech-asr", family="whisper")

    with pytest.raises(ConfigurationError, match="has family 'whisper'"):
        client.ensure_model(PROJECT_ID, name="speech-asr", family="wav2vec2")
