"""The errors a first connection runs into say which setting to fix (usability audit A-07)."""

from __future__ import annotations

from uuid import uuid4

import httpx
import pytest

from mado_tracking import ApiError, Client, ConfigurationError

PROJECT_ID = str(uuid4())
TOKEN = "connection-errors-test-secret"
WEB_PAGE = "<!doctype html><html><body>mado ML Tracking</body></html>"


def client_answering(response: httpx.Response) -> Client:
    return Client(
        api_url="http://mmt.test",
        api_token=TOKEN,
        transport=httpx.MockTransport(lambda _request: response),
    )


def test_without_a_token_it_tells_where_to_issue_one_and_how_to_enter_it(monkeypatch):
    monkeypatch.delenv("MMT_API_TOKEN", raising=False)
    with pytest.raises(ConfigurationError) as raised:
        Client(api_url="http://mmt.test")
    message = str(raised.value)
    assert message.startswith("MMT_API_TOKEN is required")
    assert "read -r -s MMT_API_TOKEN" in message


def test_without_an_api_url_it_gives_an_example_of_the_address(monkeypatch):
    monkeypatch.delenv("MMT_API_URL", raising=False)
    with pytest.raises(ConfigurationError, match="address of the web app"):
        Client(api_token=TOKEN)


def test_a_web_page_instead_of_json_points_at_mmt_api_url():
    client = client_answering(httpx.Response(200, text=WEB_PAGE, headers={"content-type": "text/html"}))
    with pytest.raises(ConfigurationError, match="not JSON.*MMT_API_URL"):
        client.find_experiment(PROJECT_ID, name="first")


def test_a_404_from_something_other_than_the_api_points_at_mmt_api_url():
    client = client_answering(httpx.Response(404, text=WEB_PAGE, headers={"content-type": "text/html"}))
    with pytest.raises(ApiError, match="did not answer as the mado ML Tracking API.*MMT_API_URL") as raised:
        client.find_experiment(PROJECT_ID, name="first")
    assert raised.value.status_code == 404


def test_the_api_s_own_404_keeps_its_message():
    api_error = {"error": "project not found", "code": "not_found"}
    client = client_answering(httpx.Response(404, json=api_error))
    with pytest.raises(ApiError) as raised:
        client.find_experiment(PROJECT_ID, name="first")
    assert str(raised.value) == "project not found"
    assert raised.value.code == "not_found"


def test_the_token_never_appears_in_these_messages():
    client = client_answering(httpx.Response(404, text=f"{WEB_PAGE}{TOKEN}"))
    with pytest.raises(ApiError) as raised:
        client.find_experiment(PROJECT_ID, name="first")
    assert TOKEN not in str(raised.value)
