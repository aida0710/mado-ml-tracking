"""Discovery of a computer's machine, Pythons and directories, on this host and from scripted output."""

from __future__ import annotations

import asyncio
import os
import platform
import shutil
from collections.abc import Sequence
from pathlib import Path

import pytest

from mado_tracking.errors import TransportError
from mado_tracking.security import SecretMasker
from mado_tracking.worker.target_discovery import (
    DISCOVERY_SCRIPT,
    TargetDiscovery,
    discover_target,
    parse_discovery_output,
)
from mado_tracking.worker.transport import CommandTransport, LocalTransport

# Locations df lists on any Linux host that can never hold a work directory.
SYSTEM_LOCATIONS = ("/proc", "/sys", "/dev", "/run", "/boot", "/snap", "/usr", "/etc")


def tokens(*values: str) -> bytes:
    return b"".join(value.encode() + b"\0" for value in values)


def discover_here() -> TargetDiscovery:
    transport = LocalTransport(allow_local_executor=True, masker=SecretMasker())
    return asyncio.run(discover_target(transport))


def write_python(path: Path, body: str, *, mode: int = 0o755) -> Path:
    """A stand-in interpreter: a shell script that answers the version question its own way."""
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(f"#!/bin/sh\n{body}\n")
    path.chmod(mode)
    return path


def test_discovery_on_this_host_reports_its_machine_cpus_memory_and_the_home_first():
    discovery = discover_here()
    assert discovery.host["machine"] == platform.machine()
    assert discovery.host["cpuCount"] == os.sysconf("SC_NPROCESSORS_ONLN")
    assert discovery.host["homeDirectory"] == os.environ["HOME"]
    if Path("/proc/meminfo").exists():
        assert discovery.host["memoryTotalBytes"] > 0
    home = discovery.directories[0]
    assert home["path"] == os.environ["HOME"] and home["source"] == "home"
    assert isinstance(home["freeBytes"], int)
    mounts = [directory["path"] for directory in discovery.directories if directory["source"] == "mount"]
    assert "/" not in mounts
    assert not [mount for mount in mounts if mount.startswith(SYSTEM_LOCATIONS)]


def test_discovery_on_this_host_finds_the_python_on_path_first_with_its_version():
    path_python = shutil.which("python3")
    assert path_python is not None
    first = discover_here().pythons[0]
    assert first["path"] == path_python
    assert first["version"] is not None and first["version"].count(".") == 2


def test_discovery_finds_venv_conda_and_pyenv_pythons_in_the_home_in_a_fixed_order(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
):
    home = tmp_path / "home"
    train = write_python(home / ".venvs/train/bin/python", "echo 3.12.1")
    garbled = write_python(home / ".venvs/garbled/bin/python", "echo Python 3.12")
    write_python(home / ".venvs/not-executable/bin/python", "echo 3.12.1", mode=0o644)
    conda_base = write_python(home / "miniconda3/bin/python", "echo 3.10.4")
    conda_env = write_python(home / "miniconda3/envs/ml/bin/python", "echo 3.11.2")
    pyenv = write_python(home / ".pyenv/versions/3.9.1/bin/python", "echo 3.9.1")
    monkeypatch.setenv("HOME", str(home))

    found = {python["path"]: python["version"] for python in discover_here().pythons}
    in_home = [path for path in found if path.startswith(str(home))]
    assert in_home == [str(garbled), str(train), str(conda_base), str(conda_env), str(pyenv)]
    assert found[str(train)] == "3.12.1"
    # An interpreter that answers something else has no version rather than a guessed one.
    assert found[str(garbled)] is None
    assert found[str(conda_env)] == "3.11.2"


def test_python_that_does_not_answer_in_time_is_offered_without_a_version(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
):
    if shutil.which("timeout") is None:
        pytest.skip("Without timeout(1) a hanging interpreter is only cut by the discovery timeout")
    home = tmp_path / "home"
    hanging = write_python(home / ".venv/bin/python", "exec sleep 30")
    monkeypatch.setenv("HOME", str(home))
    found = {python["path"]: python["version"] for python in discover_here().pythons}
    assert found[str(hanging)] is None


def test_discovery_offers_the_home_and_its_visible_directories_but_not_files_or_hidden_ones(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
):
    home = tmp_path / "home"
    (home / "work").mkdir(parents=True)
    (home / ".cache").mkdir()
    (home / "notes.txt").write_text("not a directory")
    elsewhere = tmp_path / "elsewhere"
    elsewhere.mkdir()
    (home / "linked").symlink_to(elsewhere)
    monkeypatch.setenv("HOME", str(home))

    directories = discover_here().directories
    assert directories[0]["path"] == str(home) and directories[0]["writable"] is True
    children = [directory for directory in directories if directory["source"] == "home_child"]
    assert children == [
        {"path": str(home / "linked"), "source": "home_child", "writable": True, "freeBytes": None},
        {"path": str(home / "work"), "source": "home_child", "writable": True, "freeBytes": None},
    ]


class RecordingTransport(CommandTransport):
    def __init__(self, *, output: bytes = b"", error: BaseException | None = None):
        super().__init__(masker=SecretMasker())
        self.output = output
        self.error = error
        self.calls: list[tuple[list[str], bytes | Path]] = []

    async def run(
        self,
        command: Sequence[str],
        *,
        stdin: bytes | Path = b"",
        timeout: float | None = None,  # noqa: ASYNC109 -- mirrors CommandTransport.run
    ) -> bytes:
        self.calls.append((list(command), stdin))
        if self.error is not None:
            raise self.error
        return self.output


def test_script_goes_on_stdin_and_only_its_limits_are_arguments():
    transport = RecordingTransport()
    asyncio.run(discover_target(transport))
    [(command, stdin)] = transport.calls
    assert command == ["sh", "-s", "--", "20", "40", "2", "5"]
    assert stdin == DISCOVERY_SCRIPT.encode()


@pytest.mark.parametrize("error", [TransportError("exit 127: sh: not found"), TimeoutError()])
def test_discovery_that_cannot_run_reports_nothing(error: BaseException):
    discovery = asyncio.run(discover_target(RecordingTransport(error=error)))
    assert discovery == TargetDiscovery()


def test_paths_with_newlines_and_spaces_arrive_intact():
    output = tokens(
        "home_directory", "/home/m m t",
        "python", "/home/m m t/env\nname/bin/python", "3.11.9",
        "directory", "home_child", "/home/m m t/two\nlines", "1", "",
    )  # fmt: skip
    discovery = parse_discovery_output(output)
    assert discovery.host["homeDirectory"] == "/home/m m t"
    # A path with a newline arrives whole, then is not offered: the API takes one-line paths only.
    assert discovery.pythons == [] and discovery.directories == []
    spaced = parse_discovery_output(tokens("python", "/opt/my env/bin/python", "3.12.0"))
    assert spaced.pythons == [{"path": "/opt/my env/bin/python", "version": "3.12.0"}]


def test_unknown_tags_and_malformed_values_are_skipped():
    output = tokens(
        "kernel", "6.8.0",
        "cpu_count", "many",
        "memory_kib", "-1",
        "python", "relative/bin/python", "3.11.0",
        "python", "/usr/bin/python3", "3.11",
        "directory", "scratch", "/scratch", "1", "",
        "directory", "mount", "/large", "yes", "",
        "directory", "mount", "/fast", "0", "n/a",
        "machine", "riscv64",
    )  # fmt: skip
    discovery = parse_discovery_output(output)
    assert discovery.host == {
        "machine": "riscv64",
        "cpuArch": None,
        "cpuCount": None,
        "memoryTotalBytes": None,
        "homeDirectory": None,
    }
    assert discovery.pythons == [{"path": "/usr/bin/python3", "version": None}]
    assert discovery.directories == [
        {"path": "/fast", "source": "mount", "writable": False, "freeBytes": None}
    ]


def test_output_cut_off_mid_record_keeps_only_the_complete_records():
    complete = tokens("machine", "aarch64", "python", "/usr/bin/python3", "3.12.3")
    cut = complete + b"directory\0home\0/home/mmt\0" + b"1\0123"
    discovery = parse_discovery_output(cut)
    assert discovery.host["machine"] == "aarch64" and discovery.host["cpuArch"] == "arm64"
    assert discovery.pythons == [{"path": "/usr/bin/python3", "version": "3.12.3"}]
    assert discovery.directories == []
    # A value cut in the middle (here "64" of "640") is never taken as a shorter number.
    assert parse_discovery_output(b"cpu_count\x0064").host["cpuCount"] is None


def test_repeated_candidates_are_offered_once_and_within_the_api_limits():
    pythons = [token for index in range(30) for token in ("python", f"/opt/p{index}/bin/python", "3.11.0")]
    directories = [token for index in range(50) for token in ("directory", "mount", f"/m{index}", "1", "")]
    discovery = parse_discovery_output(
        tokens(*pythons, "python", "/opt/p0/bin/python", "3.12.0", *directories)
    )
    assert len(discovery.pythons) == 20 and len(discovery.directories) == 40
    assert discovery.pythons[0] == {"path": "/opt/p0/bin/python", "version": "3.11.0"}
