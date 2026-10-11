"""Connection checks: the fixed probe and its parsing into a version 2 TargetCheckResult."""

from __future__ import annotations

import asyncio
import json
import os
import platform
import shutil
import sys
import threading
from collections.abc import Iterator, Sequence
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any
from uuid import uuid4

import pytest

from mado_tracking.errors import TransportError
from mado_tracking.security import SecretMasker
from mado_tracking.worker.reported_text import json_size
from mado_tracking.worker.target_check_report import MAX_TARGET_CHECK_RESULT_BYTES, as_result_version
from mado_tracking.worker.target_probe import (
    CONTAINER_EXEC_FLAGS,
    PROBE_SCRIPT,
    PYTHON_IDENTITY,
    check_target,
    parse_gpu_rows,
    probe_target,
)
from mado_tracking.worker.transport import CommandTransport, LocalTransport

API_TOKEN = "mmt_test-worker-secret-value"
SSH_KEY_PATH = "/home/worker/.ssh/id_gpu_host"
EMPTY_HOST = {
    "machine": None,
    "cpuArch": None,
    "cpuCount": None,
    "memoryTotalBytes": None,
    "homeDirectory": None,
}


def ssh_target(**overrides: Any) -> dict[str, Any]:
    return {
        "id": str(uuid4()),
        "executor": "ssh",
        "host": "gpu-host.internal",
        "port": 22,
        "username": "mmt",
        "sshKeyPath": SSH_KEY_PATH,
        "knownHostsPath": "/home/worker/.ssh/known_hosts",
        "workDirectory": "/srv/mmt",
        "pythonExecutable": "python3",
        "gpuIds": ["0"],
        **overrides,
    }


def healthy_facts(**overrides: Any) -> dict[str, Any]:
    flags = list(CONTAINER_EXEC_FLAGS)
    return {
        "venv": True,
        "ensurepip": True,
        "pip": {"found": True, "version": "pip 24.0 from /usr/lib/python3/dist-packages/pip"},
        "git": {"found": True, "exitCode": 0, "version": "git version 2.43.0"},
        "docker": {
            "found": True,
            "exitCode": 0,
            "version": "Docker version 27.1.1",
            "serverReachable": True,
            "serverVersion": "27.1.1",
            "socket": {"exists": True, "accessible": True},
        },
        "containers": {
            "apptainer": {
                "found": True,
                "exitCode": 0,
                "version": "apptainer version 1.3.4",
                "execFlags": flags,
            },
            "singularity": {"found": False},
        },
        "nvidia": {
            "found": True,
            "exitCode": 0,
            "rows": [
                "0, GPU-11111111-2222-3333-4444-555555555555, NVIDIA A100-SXM4-80GB, 81920",
                "1, GPU-66666666-7777-8888-9999-000000000000, NVIDIA RTX 6000 Ada, Generation, 49140",
            ],
        },
        "workDirectory": {"exists": True, "writable": True, "freeBytes": 500_000_000_000},
        "api": {"reachable": True, "status": 200},
        **overrides,
    }


def discovery_output(*tokens: str) -> bytes:
    """What the discovery script prints: NUL-terminated tokens."""
    return b"".join(token.encode() + b"\0" for token in tokens)


HEALTHY_DISCOVERY = discovery_output(
    "machine", "x86_64",
    "cpu_count", "32",
    "memory_kib", "263840000",
    "home_directory", "/home/mmt",
    "python", "/usr/bin/python3", "3.10.12",
    "python", "/home/mmt/.venvs/train/bin/python", "3.11.9",
    "directory", "home", "/home/mmt", "1", "1000",
    "directory", "mount", "/large", "0", "2000",
    "directory", "home_child", "/home/mmt/work", "1", "",
)  # fmt: skip


class ScriptedSSHTransport(CommandTransport):
    """Answers the probe steps as a remote host would, without opening a connection."""

    def __init__(
        self,
        *,
        identity: tuple[list[int], str] = ([3, 11, 9], "/usr/bin/python3"),
        facts: dict[str, Any] | None = None,
        discovery: bytes = HEALTHY_DISCOVERY,
        fail_step: str | None = None,
        failure: str = "ssh: connect to host gpu-host.internal port 22: Connection refused",
    ):
        super().__init__(masker=SecretMasker([API_TOKEN]))
        self.identity = identity
        self.facts = facts if facts is not None else healthy_facts()
        self.discovery = discovery
        self.fail_step = fail_step
        self.failure = failure
        self.commands: list[list[str]] = []

    async def run(
        self,
        command: Sequence[str],
        *,
        stdin: bytes | Path = b"",
        timeout: float | None = None,  # noqa: ASYNC109 -- mirrors CommandTransport.run
    ) -> bytes:
        self.commands.append(list(command))
        step = (
            "connection"
            if list(command) == ["true"]
            else "discovery"
            if list(command[:2]) == ["sh", "-s"]
            else "identity"
            if PYTHON_IDENTITY in command
            else "probe"
        )
        if step == self.fail_step:
            raise TransportError(f"Compute transport exited (255): {self.failure}")
        if step == "connection":
            return b""
        if step == "discovery":
            return self.discovery
        if step == "identity":
            return json.dumps([self.identity[0], self.identity[1]]).encode()
        return json.dumps(self.facts).encode()


def run_probe(transport: CommandTransport, target: dict[str, Any] | None = None) -> dict[str, Any]:
    return asyncio.run(
        probe_target(
            target or ssh_target(),
            transport=transport,
            health_url="http://mmt.internal:4182/api/health",
            masker=SecretMasker([API_TOKEN]),
        )
    )


def items_by_name(result: dict[str, Any]) -> dict[str, dict[str, Any]]:
    return {entry["name"]: entry for entry in result["items"]}


def test_healthy_ssh_target_reports_every_item_and_offers_detected_gpus_and_runtimes():
    transport = ScriptedSSHTransport()
    result = run_probe(transport)
    items = items_by_name(result)
    assert list(items) == [
        "connection",
        "python",
        "venv",
        "pip",
        "git",
        "docker",
        "apptainer",
        "singularity",
        "gpu",
        "work_directory",
        "api",
    ]
    assert {name: entry["status"] for name, entry in items.items()} == {
        "connection": "ok",
        "python": "ok",
        "venv": "ok",
        "pip": "ok",
        "git": "ok",
        "docker": "ok",
        "apptainer": "ok",
        "singularity": "unavailable",
        "gpu": "ok",
        "work_directory": "ok",
        "api": "ok",
    }
    assert items["python"]["detail"] == "3.11.9 /usr/bin/python3"
    assert items["singularity"]["code"] == "container_cli_missing"
    # The GPU name containing a comma is kept whole.
    assert result["gpus"] == [
        {
            "index": "0",
            "uuid": "GPU-11111111-2222-3333-4444-555555555555",
            "name": "NVIDIA A100-SXM4-80GB",
            "memoryTotalMiB": 81920,
        },
        {
            "index": "1",
            "uuid": "GPU-66666666-7777-8888-9999-000000000000",
            "name": "NVIDIA RTX 6000 Ada, Generation",
            "memoryTotalMiB": 49140,
        },
    ]
    assert result["runtimeKinds"] == ["python", "docker", "apptainer"]
    assert result["workDirectoryFreeBytes"] == 500_000_000_000
    probe_command = transport.commands[-1]
    assert probe_command[:3] == ["python3", "-c", PROBE_SCRIPT]
    assert probe_command[3:5] == ["/srv/mmt", "http://mmt.internal:4182/api/health"]


def test_healthy_target_reports_its_machine_pythons_and_directory_candidates_as_version_2():
    result = run_probe(ScriptedSSHTransport())
    assert result["version"] == 2
    assert result["host"] == {
        "machine": "x86_64",
        "cpuArch": "amd64",
        "cpuCount": 32,
        "memoryTotalBytes": 263840000 * 1024,
        "homeDirectory": "/home/mmt",
    }
    assert result["pythons"] == [
        {"path": "/usr/bin/python3", "version": "3.10.12"},
        {"path": "/home/mmt/.venvs/train/bin/python", "version": "3.11.9"},
    ]
    assert result["directories"] == [
        {"path": "/home/mmt", "source": "home", "writable": True, "freeBytes": 1000 * 1024},
        {"path": "/large", "source": "mount", "writable": False, "freeBytes": 2000 * 1024},
        {"path": "/home/mmt/work", "source": "home_child", "writable": True, "freeBytes": None},
    ]


def test_computer_without_python_or_work_directory_is_checked_with_the_first_discovered_python_3_11():
    transport = ScriptedSSHTransport()
    result = run_probe(transport, ssh_target(pythonExecutable="", workDirectory=""))
    probe_command = transport.commands[-1]
    # /usr/bin/python3 comes first but is 3.10; the venv's 3.11 is the one Jobs could use.
    assert probe_command[:3] == ["/home/mmt/.venvs/train/bin/python", "-c", PROBE_SCRIPT]
    # Writing is still tried somewhere real: the home the discovery reported.
    assert probe_command[3] == "/home/mmt"
    items = items_by_name(result)
    assert items["python"]["status"] == "ok"
    assert items["work_directory"] == {
        "name": "work_directory",
        "status": "skipped",
        "code": "work_directory_not_set",
        "detail": None,
    }
    assert result["workDirectoryFreeBytes"] is None
    assert result["directories"][0]["source"] == "home"


def test_computer_without_python_uses_an_older_python_that_answered_and_reports_it_too_old():
    discovery = discovery_output(
        "python", "/opt/broken/bin/python", "",
        "python", "/usr/bin/python3", "3.9.2",
    )  # fmt: skip
    transport = ScriptedSSHTransport(identity=([3, 9, 2], "/usr/bin/python3"), discovery=discovery)
    result = run_probe(transport, ssh_target(pythonExecutable=""))
    assert transport.commands[2][0] == "/usr/bin/python3"
    assert items_by_name(result)["python"]["code"] == "python_too_old"


def test_computer_without_any_python_is_python_missing_but_still_offers_its_candidates():
    discovery = discovery_output(
        "machine", "aarch64",
        "home_directory", "/home/mmt",
        "directory", "home", "/home/mmt", "1", "1000",
    )  # fmt: skip
    transport = ScriptedSSHTransport(discovery=discovery)
    result = run_probe(transport, ssh_target(pythonExecutable="", workDirectory=""))
    assert [(entry["name"], entry["status"], entry["code"]) for entry in result["items"]] == [
        ("connection", "ok", None),
        ("python", "ng", "python_missing"),
    ]
    # Nothing was started with a guessed interpreter.
    assert [command[0] for command in transport.commands] == ["true", "sh"]
    assert result["host"]["cpuArch"] == "arm64"
    assert result["directories"] == [
        {"path": "/home/mmt", "source": "home", "writable": True, "freeBytes": 1000 * 1024}
    ]
    assert result["pythons"] == []


def test_failed_discovery_leaves_the_candidates_empty_and_the_check_goes_on():
    result = run_probe(ScriptedSSHTransport(fail_step="discovery"))
    assert all(entry["status"] in {"ok", "unavailable"} for entry in result["items"])
    assert result["host"] == EMPTY_HOST
    assert result["pythons"] == [] and result["directories"] == []


def test_candidates_naming_key_files_or_tokens_are_dropped_and_others_kept():
    discovery = discovery_output(
        "machine", f"x86_64 {API_TOKEN}",
        "home_directory", "/home/mmt",
        "python", "/home/mmt/mmt_0123456789abcdef/bin/python", "3.11.9",
        "python", "/home/mmt/.venvs/train/bin/python", "3.11.9",
        "directory", "home_child", "/home/worker/.ssh/id_gpu_host.d", "1", "",
        "directory", "home_child", f"/home/mmt/{API_TOKEN}", "1", "",
        "directory", "home", "/home/mmt", "1", "1000",
    )  # fmt: skip
    result = run_probe(ScriptedSSHTransport(discovery=discovery))
    # A machine name that had to be masked is not reported at all.
    assert result["host"]["machine"] is None and result["host"]["cpuArch"] is None
    assert [python["path"] for python in result["pythons"]] == ["/home/mmt/.venvs/train/bin/python"]
    assert [directory["path"] for directory in result["directories"]] == ["/home/mmt"]
    serialized = json.dumps(result)
    assert SSH_KEY_PATH not in serialized and API_TOKEN not in serialized


def test_candidates_beyond_the_api_size_drop_directories_first_then_pythons_from_the_end():
    # Paths of multi-byte characters: 20 Pythons alone exceed the API's 32 KiB.
    long_part = "研究" * 400
    pythons = [
        token
        for index in range(20)
        for token in ("python", f"/home/mmt/{long_part}/{index:02d}/bin/python", "3.11.9")
    ]
    directories = [
        token
        for index in range(40)
        for token in ("directory", "mount", f"/data/{long_part}/{index:02d}", "1", "")
    ]
    result = run_probe(ScriptedSSHTransport(discovery=discovery_output(*pythons, *directories)))
    assert json_size(result) <= MAX_TARGET_CHECK_RESULT_BYTES
    assert result["directories"] == []
    kept = [python["path"] for python in result["pythons"]]
    assert 0 < len(kept) < 20
    assert kept == [f"/home/mmt/{long_part}/{index:02d}/bin/python" for index in range(len(kept))]


def test_candidates_beyond_the_api_size_keep_every_python_while_directories_can_go():
    long_part = "d" * 1000
    directories = [
        token
        for index in range(40)
        for token in ("directory", "mount", f"/data/{long_part}/{index:02d}", "1", "")
    ]
    result = run_probe(ScriptedSSHTransport(discovery=HEALTHY_DISCOVERY + discovery_output(*directories)))
    assert json_size(result) <= MAX_TARGET_CHECK_RESULT_BYTES
    assert len(result["pythons"]) == 2
    # The home and the first mounts survive; the last mounts went.
    assert result["directories"][0]["source"] == "home"
    assert 3 < len(result["directories"]) < 43


def test_version_1_for_old_apis_has_no_setup_candidates():
    result = as_result_version(run_probe(ScriptedSSHTransport()), 1)
    assert result["version"] == 1
    assert set(result) == {"version", "items", "gpus", "runtimeKinds", "workDirectoryFreeBytes"}


def test_missing_nvidia_smi_old_python_and_denied_docker_socket_are_ng_without_guessed_values():
    facts = healthy_facts(
        nvidia={"found": False},
        docker={
            "found": True,
            "exitCode": 0,
            "version": "Docker version 24.0.7",
            "serverReachable": False,
            "serverVersion": None,
            "socket": {"exists": True, "accessible": False},
        },
    )
    result = run_probe(ScriptedSSHTransport(identity=([3, 10, 12], "/usr/bin/python3.10"), facts=facts))
    items = items_by_name(result)
    assert items["python"] == {
        "name": "python",
        "status": "ng",
        "code": "python_too_old",
        "detail": "3.10.12 /usr/bin/python3.10",
    }
    assert items["gpu"] == {"name": "gpu", "status": "ng", "code": "nvidia_smi_missing", "detail": None}
    assert result["gpus"] is None
    assert items["docker"]["status"] == "ng"
    assert items["docker"]["code"] == "docker_socket_denied"
    # Neither the too-old Python nor the unusable docker is offered as a runtime candidate.
    assert result["runtimeKinds"] == ["apptainer"]


def test_cpu_only_target_without_nvidia_smi_is_not_an_error_and_failed_nvidia_smi_is():
    without_tool = run_probe(
        ScriptedSSHTransport(facts=healthy_facts(nvidia={"found": False})), ssh_target(gpuIds=[])
    )
    assert items_by_name(without_tool)["gpu"]["status"] == "unavailable"
    broken = run_probe(
        ScriptedSSHTransport(facts=healthy_facts(nvidia={"found": True, "exitCode": 9, "rows": []}))
    )
    assert items_by_name(broken)["gpu"] == {
        "name": "gpu",
        "status": "ng",
        "code": "nvidia_smi_failed",
        "detail": None,
    }
    assert broken["gpus"] is None


def test_daemon_down_unwritable_directory_unreachable_api_and_missing_exec_flags_are_ng():
    facts = healthy_facts(
        docker={
            "found": True,
            "exitCode": 0,
            "version": "Docker version 27.1.1",
            "serverReachable": False,
            "serverVersion": None,
            "socket": {"exists": False, "accessible": False},
        },
        containers={
            "apptainer": {
                "found": True,
                "exitCode": 0,
                "version": "apptainer version 1.0.0",
                "execFlags": ["--cleanenv"],
            },
            "singularity": {"found": False},
        },
        workDirectory={"exists": False, "writable": False, "freeBytes": None},
        api={"reachable": False, "status": 502},
        venv=False,
        ensurepip=False,
        pip={"found": False, "version": None},
        git={"found": False},
    )
    items = items_by_name(run_probe(ScriptedSSHTransport(facts=facts)))
    assert {name: (entry["status"], entry["code"]) for name, entry in items.items()} == {
        "connection": ("ok", None),
        "python": ("ok", None),
        "venv": ("ng", "venv_missing"),
        "pip": ("ng", "pip_missing"),
        "git": ("unavailable", "git_missing"),
        "docker": ("ng", "docker_daemon_unreachable"),
        "apptainer": ("ng", "container_flags_missing"),
        "singularity": ("unavailable", "container_cli_missing"),
        "gpu": ("ok", None),
        "work_directory": ("ng", "work_directory_not_writable"),
        "api": ("ng", "api_unreachable"),
    }
    assert items["api"]["detail"] == "HTTP 502"


@pytest.mark.parametrize(
    ("fail_step", "expected"),
    [
        ("connection", [("connection", "ng", "ssh_failed")]),
        ("identity", [("connection", "ok", None), ("python", "ng", "python_missing")]),
        ("probe", [("connection", "ok", None), ("python", "ng", "probe_failed")]),
    ],
)
def test_failed_steps_report_codes_and_never_the_transport_error_text(fail_step, expected):
    failure = f"Warning: Identity file {SSH_KEY_PATH} not accessible; token {API_TOKEN}"
    result = run_probe(ScriptedSSHTransport(fail_step=fail_step, failure=failure))
    assert [(entry["name"], entry["status"], entry["code"]) for entry in result["items"]] == expected
    serialized = json.dumps(result)
    assert SSH_KEY_PATH not in serialized and API_TOKEN not in serialized
    assert result["gpus"] is None and result["runtimeKinds"] == []
    assert result["version"] == 2
    if fail_step == "connection":
        assert result["host"] == EMPTY_HOST and result["pythons"] == [] and result["directories"] == []
    else:
        # Once connected, the candidates the computer reported are kept.
        assert result["host"]["homeDirectory"] == "/home/mmt"


def test_details_naming_key_files_are_dropped_and_tokens_are_masked():
    facts = healthy_facts(
        git={"found": True, "exitCode": 0, "version": f"git version 2.43.0 (config {SSH_KEY_PATH})"},
        pip={"found": True, "version": f"pip 24.0 {API_TOKEN}"},
    )
    items = items_by_name(run_probe(ScriptedSSHTransport(facts=facts)))
    assert items["git"]["detail"] is None
    assert items["pip"]["detail"] == "pip 24.0 [REDACTED]"


def test_missing_ssh_key_on_the_worker_fails_the_check_without_connecting(tmp_path: Path):
    status, result = asyncio.run(
        check_target(
            ssh_target(sshKeyPath=str(tmp_path / "missing"), knownHostsPath=str(tmp_path / "known_hosts")),
            allow_local_executor=False,
            health_url="http://mmt.internal/api/health",
            masker=SecretMasker([API_TOKEN]),
        )
    )
    assert status == "failed"
    assert result["items"] == [
        {"name": "connection", "status": "ng", "code": "ssh_configuration", "detail": None}
    ]
    assert result["version"] == 2 and result["host"] == EMPTY_HOST
    assert str(tmp_path) not in json.dumps(result)


def test_gpu_rows_that_are_not_nvidia_smi_csv_are_ignored():
    assert parse_gpu_rows(["", "No devices were found", "0, GPU-a, A100, N/A"]) == []


@pytest.fixture
def health_url() -> Iterator[str]:
    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *_arguments: Any) -> None:
            pass

        def do_GET(self) -> None:
            status = 200 if self.path == "/api/health" else 404
            self.send_response(status)
            self.send_header("Content-Length", "2")
            self.end_headers()
            self.wfile.write(b"{}")

    server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        yield f"http://127.0.0.1:{server.server_port}/api/health"
    finally:
        server.shutdown()
        server.server_close()


def test_local_transport_runs_the_real_probe_on_this_host(tmp_path: Path, health_url: str):
    transport = LocalTransport(allow_local_executor=True, masker=SecretMasker([API_TOKEN]))
    target = {
        "id": str(uuid4()),
        "executor": "local",
        "workDirectory": str(tmp_path / "not-created-yet"),
        "pythonExecutable": sys.executable,
        "gpuIds": [],
        "sshKeyPath": "",
        "knownHostsPath": "",
    }
    result = asyncio.run(
        probe_target(target, transport=transport, health_url=health_url, masker=SecretMasker([API_TOKEN]))
    )
    items = items_by_name(result)
    version = ".".join(str(part) for part in sys.version_info[:3])
    assert items["python"]["status"] == "ok"
    assert items["python"]["detail"].startswith(version)
    assert items["venv"]["status"] == "ok"
    # A missing work directory counts as writable when the worker could create it.
    assert items["work_directory"]["status"] == "ok"
    assert not (tmp_path / "not-created-yet").exists()
    assert list(tmp_path.iterdir()) == []
    assert isinstance(result["workDirectoryFreeBytes"], int)
    assert items["api"]["status"] == "ok"
    assert "python" in result["runtimeKinds"]
    # Whatever this host has, GPU values are either nvidia-smi rows or absent.
    assert result["gpus"] is None or all(gpu["uuid"] for gpu in result["gpus"])
    assert result["version"] == 2
    assert result["host"]["machine"] == platform.machine()
    assert result["host"]["homeDirectory"] == os.environ["HOME"]


def test_local_computer_being_set_up_is_checked_with_a_python_found_on_it(
    tmp_path: Path, health_url: str, monkeypatch: pytest.MonkeyPatch
):
    home = tmp_path / "home"
    (home / "experiments").mkdir(parents=True)
    monkeypatch.setenv("HOME", str(home))
    transport = LocalTransport(allow_local_executor=True, masker=SecretMasker([API_TOKEN]))
    target = {
        "id": str(uuid4()),
        "executor": "local",
        "workDirectory": "",
        "pythonExecutable": "",
        "gpuIds": [],
        "sshKeyPath": "",
        "knownHostsPath": "",
    }
    result = asyncio.run(
        probe_target(target, transport=transport, health_url=health_url, masker=SecretMasker([API_TOKEN]))
    )
    items = items_by_name(result)
    path_python = shutil.which("python3")
    assert path_python is not None
    assert items["python"]["status"] == "ok"
    assert items["python"]["detail"].endswith(path_python)
    assert items["work_directory"]["code"] == "work_directory_not_set"
    home_candidate, *other_candidates = result["directories"]
    assert home_candidate["path"] == str(home) and home_candidate["source"] == "home"
    experiments = {"path": str(home / "experiments"), "source": "home_child", "writable": True}
    assert {**experiments, "freeBytes": None} in other_candidates
    # The writing check in the home leaves nothing behind.
    assert sorted(path.name for path in home.iterdir()) == ["experiments"]
