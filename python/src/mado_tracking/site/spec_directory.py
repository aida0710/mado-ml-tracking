"""specディレクトリ。launcherや`mado-tracking submit`が、1回のjob shellの呼び出しに渡すもの。

    <spec dir>/          0700
      submission.json    Job tokenを除いたSiteSubmission。job shellはid・version・sha256だけ
                         （job shell自体は別にインストールする）
      api.json           {"apiUrl"}。計算ノードから見たAPIのURL
      runner.json        siteのrunnerの設定（RunnerSettings）
      jobs/<i>.json      array順でi番目のJobのWorkerJobとそのJob token（0600）
      secrets.json       {"registry": {"username", "password"}}。任意（0600）

runnerはjobs/<MMT_ARRAY_INDEX>.jsonを読む。iはスケジューラのarray番号で、0から数える。
"""

from __future__ import annotations

import json
import os
import stat
from collections.abc import Mapping
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from ..errors import ConfigurationError
from ..worker.config import DEFAULT_CANCEL_GRACE_SECONDS, MAX_CONFIGURABLE_OUTPUT_FILES
from ..worker.container_outputs import DEFAULT_MAX_OUTPUT_FILES
from .file_archive import PRIVATE_FILE_MODE

SUBMISSION_FILENAME = "submission.json"
API_FILENAME = "api.json"
RUNNER_SETTINGS_FILENAME = "runner.json"
JOBS_DIRECTORY = "jobs"
SECRETS_FILENAME = "secrets.json"
# schedulerは、スケジューラがこのノードにGPUを割り当てたもの（CUDA_VISIBLE_DEVICES）。leaseは、
# スケジューラの無いホストでrunnerが空いているGPUを自分で選ぶもの（DockerのGPUサーバー）。
GPU_ASSIGNMENTS = ("scheduler", "lease")
# contractsのMAX_SITE_CANCEL_GRACE_SECONDS。画面のsiteの設定で許す最大値。siteでは、SIGTERMの
# あとスケジューラがkillするまでの猶予に収める。超えるとスケジューラが先にkillする。
MAX_CANCEL_GRACE_SECONDS = 3600.0
# specの文書は小さい。これより大きいファイルは、このパッケージが書いたものではない。
MAX_SPEC_FILE_BYTES = 64 * 1024**2
# submission.jsonに残すjob shellのバージョンの情報。どのバージョンかだけを残し、内容は残さない
# （内容は最大1MiBで、内容ごとに一度だけ<work dir>/.mmt-job-shells/の下にインストールする）。
SUBMISSION_JOB_SHELL_FIELDS = ("id", "version", "sha256")


@dataclass(frozen=True)
class RunnerSettings:
    """runner.json。launcherやsubmitの設定から作る、このsiteでのrunnerの動かし方。"""

    work_directory: str
    gpu_assignment: str = "scheduler"
    # leaseのときだけ使う。runnerが選んでよいGPU。空なら、nvidia-smiが示すすべてのGPU。
    gpu_ids: tuple[str, ...] = ()
    cancel_grace_seconds: float = DEFAULT_CANCEL_GRACE_SECONDS
    max_output_files: int = DEFAULT_MAX_OUTPUT_FILES

    def __post_init__(self) -> None:
        if not self.work_directory.startswith("/") or any(
            character in self.work_directory for character in "\r\n\x00"
        ):
            raise ConfigurationError("The site work directory must be an absolute path")
        if self.gpu_assignment not in GPU_ASSIGNMENTS:
            raise ConfigurationError(f"gpu_assignment must be one of {', '.join(GPU_ASSIGNMENTS)}")
        if not all(isinstance(value, str) and value and "," not in value for value in self.gpu_ids):
            raise ConfigurationError("gpu_ids must be GPU indexes or UUIDs")
        if (
            isinstance(self.cancel_grace_seconds, bool)
            or not isinstance(self.cancel_grace_seconds, int | float)
            or not 0 < self.cancel_grace_seconds <= MAX_CANCEL_GRACE_SECONDS
        ):
            raise ConfigurationError(f"cancel_grace_seconds must be from 0 to {MAX_CANCEL_GRACE_SECONDS}")
        if type(self.max_output_files) is not int or not 1 <= self.max_output_files <= (
            MAX_CONFIGURABLE_OUTPUT_FILES
        ):
            raise ConfigurationError(f"max_output_files must be from 1 to {MAX_CONFIGURABLE_OUTPUT_FILES}")

    def to_document(self) -> dict[str, Any]:
        return {
            "workDirectory": self.work_directory,
            "gpuAssignment": self.gpu_assignment,
            "gpuIds": list(self.gpu_ids),
            "cancelGraceSeconds": self.cancel_grace_seconds,
            "maxOutputFiles": self.max_output_files,
        }

    @classmethod
    def from_document(cls, document: Any) -> RunnerSettings:
        if not isinstance(document, dict) or not isinstance(document.get("workDirectory"), str):
            raise ConfigurationError(f"{RUNNER_SETTINGS_FILENAME} needs workDirectory")
        gpu_ids = document.get("gpuIds", [])
        if not isinstance(gpu_ids, list):
            raise ConfigurationError(f"{RUNNER_SETTINGS_FILENAME} gpuIds must be a list")
        return cls(
            work_directory=document["workDirectory"],
            gpu_assignment=document.get("gpuAssignment", "scheduler"),
            gpu_ids=tuple(gpu_ids),
            cancel_grace_seconds=document.get("cancelGraceSeconds", DEFAULT_CANCEL_GRACE_SECONDS),
            max_output_files=document.get("maxOutputFiles", DEFAULT_MAX_OUTPUT_FILES),
        )


def ordered_jobs(submission: Mapping[str, Any]) -> list[dict[str, Any]]:
    """array順に並べたWorkerJob。jobs/<i>.jsonとMMT_JOB_IDSはこの順に従う。"""
    return sorted(
        submission["jobs"], key=lambda item: (item["job"].get("arrayIndex") or 0, str(item["job"]["id"]))
    )


def secret_values_of(secrets: Mapping[str, Any]) -> list[str]:
    """secrets.jsonの値のうち、どの出力にも出してはいけないもの（レジストリのパスワード）。"""
    registry = secrets.get("registry")
    if isinstance(registry, dict) and isinstance(registry.get("password"), str):
        return [registry["password"]]
    return []


def _document(value: Any) -> bytes:
    return json.dumps(value, ensure_ascii=False, allow_nan=False, sort_keys=True).encode()


def spec_files(
    submission: Mapping[str, Any],
    *,
    api_url: str,
    settings: RunnerSettings,
    secrets: Mapping[str, Any] | None = None,
) -> dict[str, tuple[bytes, int]]:
    """specディレクトリの全ファイルを、相対パス -> (content, mode)の形で返す。"""
    jobs = ordered_jobs(submission)
    recorded = {**submission, "jobs": [{**job, "jobToken": None} for job in jobs]}
    job_shell = submission.get("jobShell")
    if isinstance(job_shell, Mapping):
        recorded["jobShell"] = {
            key: job_shell[key] for key in SUBMISSION_JOB_SHELL_FIELDS if key in job_shell
        }
    files = {
        SUBMISSION_FILENAME: (_document(recorded), PRIVATE_FILE_MODE),
        API_FILENAME: (_document({"apiUrl": api_url}), PRIVATE_FILE_MODE),
        RUNNER_SETTINGS_FILENAME: (_document(settings.to_document()), PRIVATE_FILE_MODE),
    }
    for index, job in enumerate(jobs):
        files[f"{JOBS_DIRECTORY}/{index}.json"] = (_document(job), PRIVATE_FILE_MODE)
    if secrets:
        files[SECRETS_FILENAME] = (_document(dict(secrets)), PRIVATE_FILE_MODE)
    return files


class SpecDirectory:
    """読む側。計算ノードのrunnerが使う。"""

    def __init__(self, path: Path):
        if path.is_symlink() or not path.is_dir():
            raise ConfigurationError(f"Spec directory is not a directory: {path}")
        self.path = path.resolve()

    def read(self, name: str, *, private: bool = False) -> Any:
        path = self.path / name
        try:
            descriptor = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
        except OSError as error:
            raise ConfigurationError(
                f"{name} in the spec directory could not be read: {error.strerror}"
            ) from None
        with os.fdopen(descriptor, "rb") as content:
            properties = os.fstat(content.fileno())
            if not stat.S_ISREG(properties.st_mode):
                raise ConfigurationError(f"{name} in the spec directory must be a regular file")
            if private and properties.st_mode & 0o077:
                raise ConfigurationError(f"{name} holds credentials and must not be readable by others")
            raw = content.read(MAX_SPEC_FILE_BYTES + 1)
        if len(raw) > MAX_SPEC_FILE_BYTES:
            raise ConfigurationError(f"{name} in the spec directory is too large")
        try:
            return json.loads(raw)
        except ValueError:
            raise ConfigurationError(f"{name} in the spec directory is not JSON") from None

    def submission(self) -> dict[str, Any]:
        document = self.read(SUBMISSION_FILENAME)
        if not isinstance(document, dict) or not isinstance(document.get("jobs"), list):
            raise ConfigurationError(f"{SUBMISSION_FILENAME} is not a SiteSubmission")
        return document

    def api_url(self) -> str:
        document = self.read(API_FILENAME)
        if not isinstance(document, dict) or not isinstance(document.get("apiUrl"), str):
            raise ConfigurationError(f"{API_FILENAME} needs apiUrl")
        return str(document["apiUrl"])

    def runner_settings(self) -> RunnerSettings:
        return RunnerSettings.from_document(self.read(RUNNER_SETTINGS_FILENAME))

    def job_payload(self, array_index: int) -> dict[str, Any]:
        document = self.read(f"{JOBS_DIRECTORY}/{array_index}.json", private=True)
        if not isinstance(document, dict):
            raise ConfigurationError("The spec directory's Job file is not a WorkerJob")
        return document

    def secrets(self) -> dict[str, Any]:
        if not (self.path / SECRETS_FILENAME).exists():
            return {}
        document = self.read(SECRETS_FILENAME, private=True)
        if not isinstance(document, dict):
            raise ConfigurationError(f"{SECRETS_FILENAME} must be a JSON object")
        return document
