"""SSH key and known_hosts candidates in workerInfo: what is offered and how it reaches the API.

APIs that refuse workerInfo fields are in test_worker_info.py.
"""

from __future__ import annotations

import builtins
import json
from pathlib import Path
from typing import Any

import pytest
from test_worker_info import PresenceServer, run_presence

from mado_tracking.worker.ssh_files import (
    MAX_WORKER_SSH_FILE_PATHS,
    SSH_DIRECTORY_VARIABLE,
    default_ssh_directories,
    find_ssh_files,
)
from mado_tracking.worker.worker_info import SSH_FILE_SCAN_INTERVAL_SECONDS, WorkerInfo

# What the ssh_directory fixture offers as keys: by name (id_*, *.pem) or by owner-only mode.
EXPECTED_KEY_NAMES = ("gpu.pem", "id_ed25519", "id_linked", "lab-cluster")


def write_file(path: Path, *, mode: int) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("never read by the worker\n")
    path.chmod(mode)
    return path


@pytest.fixture
def ssh_directory(tmp_path: Path) -> Path:
    directory = tmp_path / ".ssh"
    write_file(directory / "id_ed25519", mode=0o600)
    write_file(directory / "id_ed25519.pub", mode=0o644)
    write_file(directory / "known_hosts", mode=0o644)
    write_file(directory / "known_hosts.lab", mode=0o644)
    write_file(directory / "config", mode=0o600)
    write_file(directory / "authorized_keys", mode=0o600)
    write_file(directory / "gpu.pem", mode=0o644)
    write_file(directory / "lab-cluster", mode=0o600)
    write_file(directory / "notes.txt", mode=0o644)
    write_file(directory / "nested" / "id_inner", mode=0o600)
    (directory / "id_linked").symlink_to(write_file(tmp_path / "keys" / "shared", mode=0o600))
    (directory / "id_broken").symlink_to(tmp_path / "keys" / "missing")
    return directory


def test_keys_are_offered_by_name_or_owner_only_mode_and_known_hosts_by_name(ssh_directory: Path):
    found = find_ssh_files([ssh_directory])
    assert found.key_paths == tuple(str(ssh_directory / name) for name in EXPECTED_KEY_NAMES)
    assert found.known_hosts_paths == (
        str(ssh_directory / "known_hosts"),
        str(ssh_directory / "known_hosts.lab"),
    )


def test_ssh_files_are_found_from_names_and_modes_without_opening_any(
    ssh_directory: Path, monkeypatch: pytest.MonkeyPatch
):
    # A key only root could read is still offered: its name is all the worker looks at.
    write_file(ssh_directory / "id_unreadable", mode=0o000)
    real_open = builtins.open

    def refuse_ssh_files(file: Any, *arguments: Any, **keywords: Any) -> Any:
        if str(ssh_directory) in str(file):
            raise AssertionError(f"opened {file}")
        return real_open(file, *arguments, **keywords)

    monkeypatch.setattr(builtins, "open", refuse_ssh_files)
    found = find_ssh_files([ssh_directory])
    assert str(ssh_directory / "id_unreadable") in found.key_paths


def test_candidates_are_sorted_deduplicated_and_limited(tmp_path: Path):
    first, second = tmp_path / "first", tmp_path / "second"
    for index in range(MAX_WORKER_SSH_FILE_PATHS + 10):
        write_file(first / f"id_{index:03d}", mode=0o600)
    write_file(second / "id_000", mode=0o600)
    found = find_ssh_files([second, first, first])
    assert len(found.key_paths) == MAX_WORKER_SSH_FILE_PATHS
    assert list(found.key_paths) == sorted(set(found.key_paths))
    assert found.key_paths[0] == str(first / "id_000")


def test_paths_the_api_would_refuse_are_not_offered(tmp_path: Path):
    directory = tmp_path / ".ssh"
    write_file(directory / "id_two\nlines", mode=0o600)
    deep = tmp_path.joinpath(*["d" * 250] * 4)
    write_file(deep / "id_deep", mode=0o600)
    write_file(directory / "id_kept", mode=0o600)
    found = find_ssh_files([directory, deep])
    assert found.key_paths == (str(directory / "id_kept"),)


def test_missing_ssh_directory_offers_nothing(tmp_path: Path):
    found = find_ssh_files([tmp_path / "absent", tmp_path / "file"])
    assert found.key_paths == () and found.known_hosts_paths == ()


def test_ssh_directories_are_the_home_one_and_mmt_worker_ssh_dir(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
):
    monkeypatch.setenv("HOME", str(tmp_path / "home"))
    assert default_ssh_directories({}) == (tmp_path / "home" / ".ssh",)
    assert default_ssh_directories({SSH_DIRECTORY_VARIABLE: str(tmp_path / "keys")}) == (
        tmp_path / "home" / ".ssh",
        tmp_path / "keys",
    )


def test_ssh_files_are_listed_again_once_the_scan_interval_has_passed(tmp_path: Path):
    now = [0.0]
    directory = tmp_path / ".ssh"
    write_file(directory / "id_old", mode=0o600)
    info = WorkerInfo(ssh_directories=[directory], clock=lambda: now[0])
    write_file(directory / "id_new", mode=0o600)
    now[0] = SSH_FILE_SCAN_INTERVAL_SECONDS - 1
    assert info.payload()["sshFiles"]["keyPaths"] == [str(directory / "id_old")]
    now[0] = SSH_FILE_SCAN_INTERVAL_SECONDS
    assert info.payload()["sshFiles"]["keyPaths"] == [str(directory / "id_new"), str(directory / "id_old")]


def test_claim_and_resume_report_the_ssh_file_paths_in_worker_info(ssh_directory: Path):
    server = PresenceServer()
    run_presence(server, ssh_directories=[ssh_directory])
    expected = {
        "keyPaths": [str(ssh_directory / name) for name in EXPECTED_KEY_NAMES],
        "knownHostsPaths": [str(ssh_directory / "known_hosts"), str(ssh_directory / "known_hosts.lab")],
    }
    assert [(endpoint, body["workerInfo"]["sshFiles"]) for endpoint, body in server.requests] == [
        ("resume", expected),
        ("claim", expected),
    ]
    assert "never read" not in json.dumps(server.requests)
