"""Reading one directory of a computer: the real script on this host, its parsing and its limits."""

from __future__ import annotations

import asyncio
import os
import shlex
from collections.abc import Sequence
from pathlib import Path
from typing import Any
from uuid import uuid4

import pytest

from mado_tracking.errors import TransportError
from mado_tracking.security import SecretMasker
from mado_tracking.worker import directory_listing
from mado_tracking.worker.directory_listing import (
    LISTING_SCRIPT,
    MAX_DIRECTORY_LISTING_ENTRIES,
    MAX_DIRECTORY_LISTING_RESULT_BYTES,
    list_directory,
    parse_listing_output,
)
from mado_tracking.worker.reported_text import json_size
from mado_tracking.worker.transport import CommandTransport

API_TOKEN = "mmt_listing-worker-secret"


def local_target() -> dict[str, Any]:
    return {
        "id": str(uuid4()),
        "executor": "local",
        "workDirectory": "",
        "pythonExecutable": "",
        "gpuIds": [],
        "sshKeyPath": "",
        "knownHostsPath": "",
    }


def list_here(path: str) -> tuple[str, dict[str, Any]]:
    return asyncio.run(
        list_directory(local_target(), path, allow_local_executor=True, masker=SecretMasker([API_TOKEN]))
    )


def entries_by_name(result: dict[str, Any]) -> dict[str, dict[str, Any]]:
    return {entry["name"]: entry for entry in result["entries"]}


def test_listing_reports_directories_executables_and_hidden_entries_with_spaces(tmp_path: Path):
    (tmp_path / "data").mkdir()
    (tmp_path / "run.sh").write_text("#!/bin/sh\n")
    (tmp_path / "run.sh").chmod(0o755)
    (tmp_path / "notes.txt").write_text("")
    (tmp_path / ".env").write_text("")
    (tmp_path / "..double").write_text("")
    (tmp_path / "with space").mkdir()
    (tmp_path / "two\nlines").write_text("")
    (tmp_path / "linked-data").symlink_to(tmp_path / "data")
    (tmp_path / "dangling").symlink_to(tmp_path / "missing")
    (tmp_path / API_TOKEN).write_text("")
    (tmp_path / "mmt_0123456789abcdef").write_text("")

    status, result = list_here(str(tmp_path))
    assert status == "finished"
    assert result["path"] == str(tmp_path) and result["outcome"] == "ok"
    assert result["truncated"] is False
    assert entries_by_name(result) == {
        "data": {"name": "data", "kind": "directory", "executable": False},
        "run.sh": {"name": "run.sh", "kind": "file", "executable": True},
        "notes.txt": {"name": "notes.txt", "kind": "file", "executable": False},
        ".env": {"name": ".env", "kind": "file", "executable": False},
        "..double": {"name": "..double", "kind": "file", "executable": False},
        "with space": {"name": "with space", "kind": "directory", "executable": False},
        # A symlink counts as what it points to; a broken one is a file.
        "linked-data": {"name": "linked-data", "kind": "directory", "executable": False},
        "dangling": {"name": "dangling", "kind": "file", "executable": False},
    }


def test_tilde_is_the_home_of_the_user_on_the_computer(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    home = tmp_path / "home"
    (home / "projects" / "mmt").mkdir(parents=True)
    monkeypatch.setenv("HOME", str(home))

    status, result = list_here("~")
    assert status == "finished" and result["path"] == str(home)
    assert result["entries"] == [{"name": "projects", "kind": "directory", "executable": False}]
    _, nested = list_here("~/projects")
    assert nested["path"] == f"{home}/projects"
    assert [entry["name"] for entry in nested["entries"]] == ["mmt"]


def test_missing_paths_files_and_unreadable_directories_have_their_own_outcomes(tmp_path: Path):
    (tmp_path / "file.txt").write_text("")
    assert list_here(str(tmp_path / "absent"))[1] == {
        "path": str(tmp_path / "absent"),
        "outcome": "missing",
        "entries": [],
        "truncated": False,
    }
    assert list_here(str(tmp_path / "file.txt"))[1]["outcome"] == "not_directory"
    if os.geteuid() == 0:
        pytest.skip("root reads every directory")
    locked = tmp_path / "locked"
    locked.mkdir()
    (locked / "secret").write_text("")
    locked.chmod(0o000)
    try:
        status, result = list_here(str(locked))
    finally:
        locked.chmod(0o700)
    assert status == "finished"
    assert result["outcome"] == "denied" and result["entries"] == []


def test_large_directory_lists_the_first_entries_and_says_it_was_truncated(tmp_path: Path):
    for index in range(MAX_DIRECTORY_LISTING_ENTRIES + 5):
        (tmp_path / f"run-{index:04d}").write_text("")
    _, result = list_here(str(tmp_path))
    assert len(result["entries"]) == MAX_DIRECTORY_LISTING_ENTRIES
    assert result["truncated"] is True
    assert result["entries"][0]["name"] == "run-0000"


class LoginShellTransport(CommandTransport):
    """Runs the command line through a shell, as sshd hands SSHTransport's command to the login shell."""

    def command_argv(self, command: Sequence[str]) -> list[str]:
        return ["sh", "-c", shlex.join(command)]


@pytest.mark.parametrize("name", ["$(touch injected)", "`touch injected`", "it's; touch injected", "*"])
def test_paths_with_shell_syntax_are_read_as_paths_and_never_run(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, name: str
):
    directory = tmp_path / name
    directory.mkdir()
    (directory / "inside").write_text("")
    monkeypatch.chdir(tmp_path)
    monkeypatch.setattr(
        directory_listing,
        "create_target_transport",
        lambda *_arguments, **_keywords: LoginShellTransport(masker=SecretMasker()),
    )
    for path in (str(directory), str(tmp_path / "absent" / name)):
        status, result = list_here(path)
        assert status == "finished" and result["path"] == path
    assert [entry["name"] for entry in list_here(str(directory))[1]["entries"]] == ["inside"]
    assert not list(tmp_path.rglob("injected"))


def test_script_goes_on_stdin_and_the_path_is_only_an_argument(monkeypatch: pytest.MonkeyPatch):
    calls: list[tuple[list[str], bytes | Path]] = []

    class RecordingTransport(CommandTransport):
        async def run(
            self,
            command: Sequence[str],
            *,
            stdin: bytes | Path = b"",
            timeout: float | None = None,  # noqa: ASYNC109 -- mirrors CommandTransport.run
        ) -> bytes:
            calls.append((list(command), stdin))
            return b"missing\0/srv/$(id)\0"

    monkeypatch.setattr(
        directory_listing,
        "create_target_transport",
        lambda *_arguments, **_keywords: RecordingTransport(masker=SecretMasker()),
    )
    list_here("/srv/$(id)")
    [(command, stdin)] = calls
    assert command == ["sh", "-s", "--", "/srv/$(id)", str(MAX_DIRECTORY_LISTING_ENTRIES + 1)]
    assert stdin == LISTING_SCRIPT.encode()
    assert "$(id)" not in LISTING_SCRIPT


@pytest.mark.parametrize("error", [TransportError("exit 255: ssh: connect refused"), TimeoutError()])
def test_computer_that_does_not_answer_fails_the_listing_as_unreachable(
    monkeypatch: pytest.MonkeyPatch, error: BaseException
):
    class FailingTransport(CommandTransport):
        async def run(self, *_arguments: Any, **_keywords: Any) -> bytes:
            raise error

    monkeypatch.setattr(
        directory_listing,
        "create_target_transport",
        lambda *_arguments, **_keywords: FailingTransport(masker=SecretMasker()),
    )
    assert list_here("~/data") == (
        "failed",
        {"path": "~/data", "outcome": "unreachable", "entries": [], "truncated": False},
    )


def test_missing_ssh_key_on_the_worker_fails_the_listing_without_connecting(tmp_path: Path):
    target = {
        **local_target(),
        "executor": "ssh",
        "host": "gpu-host.internal",
        "port": 22,
        "username": "mmt",
        "sshKeyPath": str(tmp_path / "missing-key"),
        "knownHostsPath": str(tmp_path / "known_hosts"),
    }
    status, result = asyncio.run(
        list_directory(target, "/srv", allow_local_executor=False, masker=SecretMasker())
    )
    assert status == "failed" and result["outcome"] == "unreachable" and result["path"] == "/srv"


def entry_tokens(*entries: tuple[str, str, str]) -> bytes:
    return b"".join(f"{kind}\0{executable}\0{name}\0".encode() for kind, executable, name in entries)


def test_names_the_api_would_refuse_are_dropped_and_others_kept():
    raw = b"ok\0/srv\0" + entry_tokens(
        ("f", "0", "a" * 255),
        ("f", "0", "b" * 256),
        ("f", "0", "tab\there"),
        ("d", "0", "."),
        ("d", "0", ".."),
        ("f", "0", "mmt_0123456789abcdef"),
        ("x", "0", "unknown-kind"),
        ("f", "maybe", "unknown-flag"),
        ("d", "0", "kept"),
    )
    result = parse_listing_output(raw, requested_path="/srv", masker=SecretMasker())
    assert result is not None
    assert [entry["name"] for entry in result["entries"]] == ["a" * 255, "kept"]
    assert result["truncated"] is False


def test_listing_beyond_the_api_size_drops_the_last_entries_and_says_it_was_truncated():
    names = [("f", "0", f"{index:03d}" + "名" * 250) for index in range(MAX_DIRECTORY_LISTING_ENTRIES)]
    result = parse_listing_output(
        b"ok\0/srv\0" + entry_tokens(*names), requested_path="/srv", masker=SecretMasker()
    )
    assert result is not None
    assert json_size(result) <= MAX_DIRECTORY_LISTING_RESULT_BYTES
    assert 0 < len(result["entries"]) < MAX_DIRECTORY_LISTING_ENTRIES
    assert result["truncated"] is True
    assert result["entries"][-1]["name"].startswith(f"{len(result['entries']) - 1:03d}")


def test_output_that_is_not_the_scripts_is_not_taken_for_a_listing():
    for banner in (b"", b"Welcome to gpu-host\n"):
        assert parse_listing_output(banner, requested_path="/srv", masker=SecretMasker()) is None
    # An entry cut off at the end is left out; the complete ones stay.
    cut = b"ok\0/srv\0" + entry_tokens(("d", "0", "complete")) + b"f\0" + b"1\0trunc"
    result = parse_listing_output(cut, requested_path="/srv", masker=SecretMasker())
    assert result is not None and [entry["name"] for entry in result["entries"]] == ["complete"]
