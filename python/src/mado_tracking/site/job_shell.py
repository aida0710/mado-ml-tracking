"""job shellの契約。siteのjob shellが受け取る変数と、job shellが出力する行。

job shellはMMT_GPU_COUNT、MMT_WALLTIME、MMT_ARRAY_SIZEをsiteのスケジューラのオプションに
変え、`"$MMT_RUNNER" "$MMT_SPEC_DIR"`を投入し、スケジューラのジョブIDを標準出力の最後の行に
出す（スケジューラの無いホストでは、何も出さないか空の行）。
"""

from __future__ import annotations

import re
from collections.abc import Mapping, Sequence
from typing import Any

from ..errors import ConfigurationError
from ..security import SecretMasker

# APIのデータベースのjobs.scheduler_job_id。
MAX_SCHEDULER_JOB_ID_LENGTH = 200
SECONDS_PER_HOUR = 3600
SECONDS_PER_MINUTE = 60
# Job.errorにはjob shellのstderrの末尾を残す。スケジューラが拒んだ理由はそこに出る。
JOB_SHELL_ERROR_CHARACTERS = 1000
VARIABLE_NAME = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*$")
VARIABLE_PREFIX = "MMT_VAR_"
# リモートのシェルのコマンドラインや環境変数で、値として運べない文字。
FORBIDDEN_VALUE_CHARACTERS = "\r\n\x00"


class JobShellOutputError(ValueError):
    """job shellの最後の行が、スケジューラのジョブIDになっていない。"""


def format_walltime(seconds: int | None) -> str:
    """HH:MM:SS（24時間を超えてもそのまま数える。72:00:00）。Jobに上限が無ければ空。"""
    if seconds is None:
        return ""
    hours, remainder = divmod(int(seconds), SECONDS_PER_HOUR)
    minutes, rest = divmod(remainder, SECONDS_PER_MINUTE)
    return f"{hours:02d}:{minutes:02d}:{rest:02d}"


def _checked_value(name: str, value: str) -> str:
    if any(character in value for character in FORBIDDEN_VALUE_CHARACTERS):
        raise ConfigurationError(f"{name} must not contain newlines or NUL characters")
    return value


def job_shell_environment(
    jobs: Sequence[Mapping[str, Any]],
    *,
    spec_directory: str,
    runner: str,
    target_id: str,
    variables: Mapping[str, str],
) -> dict[str, str]:
    """1回のjob shellの呼び出しの環境変数。`jobs`は、その投入のWorkerJobをarrayの順に並べたもの。"""
    if not jobs:
        raise ConfigurationError("A submission needs at least one Job")
    first = jobs[0]["job"]
    environment = {
        "MMT_SPEC_DIR": spec_directory,
        "MMT_RUNNER": runner,
        "MMT_GPU_COUNT": str(int(first.get("gpuCount") or 0)),
        "MMT_WALLTIME_SECONDS": "" if first.get("walltimeSeconds") is None else str(first["walltimeSeconds"]),
        "MMT_WALLTIME": format_walltime(first.get("walltimeSeconds")),
        "MMT_ARRAY_SIZE": str(len(jobs)),
        "MMT_JOB_IDS": ",".join(str(job["job"]["id"]) for job in jobs),
        "MMT_PROJECT_ID": str(first["projectId"]),
        "MMT_TARGET_ID": target_id,
    }
    for name, value in variables.items():
        if not VARIABLE_NAME.fullmatch(name):
            raise ConfigurationError(f"Variable name {name!r} is not a shell variable name")
        environment[VARIABLE_PREFIX + name] = _checked_value(VARIABLE_PREFIX + name, str(value))
    for name, value in environment.items():
        _checked_value(name, value)
    return environment


def scheduler_job_id(stdout: bytes) -> str | None:
    """job shellのstdoutの最後の行から取る、スケジューラのジョブID。空ならNone。"""
    text = stdout.decode("utf-8", "replace")
    lines = text.split("\n")
    if text.endswith("\n"):
        lines.pop()
    last = lines[-1].strip() if lines else ""
    if not last:
        return None
    if len(last) > MAX_SCHEDULER_JOB_ID_LENGTH or any(
        character.isspace() or not character.isprintable() for character in last
    ):
        raise JobShellOutputError(
            "The job shell's last output line must be the scheduler job ID alone "
            f"(at most {MAX_SCHEDULER_JOB_ID_LENGTH} characters, no spaces)"
        )
    return last


def job_shell_error(exit_code: int, stderr: bytes, masker: SecretMasker) -> str:
    detail = masker.mask(stderr.decode("utf-8", "replace")).strip()
    if len(detail) > JOB_SHELL_ERROR_CHARACTERS:
        detail = "..." + detail[-JOB_SHELL_ERROR_CHARACTERS:]
    message = f"The job shell exited with status {exit_code}"
    return f"{message}: {detail}" if detail else message
