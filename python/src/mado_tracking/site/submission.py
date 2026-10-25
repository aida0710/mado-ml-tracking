"""siteのjob shellを通して1つのSiteSubmissionを投入し、その結果をAPI向けにまとめる。

launcher（SSH経由）と`mado-tracking submit`（ログインノードかPCの上）が共有する。作業ディレクトリの
準備は再試行する。ただし、siteがログインを拒んだときは再試行しない。もう一度試してもログインの失敗が
1回増えるだけで、siteは数回の失敗でアカウントをロックするため。job shell自体は1回だけ動かす。
応答が届かなくても、スケジューラが既にジョブを受け取っているかもしれず、2回目の投入ではジョブが
2回動くため。結果に含めるどのエラーでも、specディレクトリにあるJob tokenとレジストリのログイン情報は
隠す。siteにまったく届かなかったときも結果に示し、launcherが今回のポーリングの残りで、同じログインを
使って再びログインしないようにする。
"""

from __future__ import annotations

import logging
import time
from collections.abc import Callable, Mapping
from dataclasses import dataclass, field
from typing import Any, TypeVar

from ..errors import ConfigurationError, TransportError
from ..security import SecretMasker
from .bundle import runner_installation
from .job_shell import JobShellOutputError, job_shell_environment, job_shell_error, scheduler_job_id
from .site_operations import SiteOperations
from .spec_directory import RunnerSettings, ordered_jobs, secret_values_of, spec_files
from .transport import LoginRefused

LOGGER = logging.getLogger(__name__)
SETUP_ATTEMPTS = 3
SETUP_RETRY_SECONDS = 2.0
Result = TypeVar("Result")


@dataclass(frozen=True)
class SubmissionPlan:
    """1つのsiteの投入方法。job shell、runner、job shellが受け取る値。"""

    job_shell: bytes
    runner_python: str
    # 計算ノードから見たAPIのURL（launcherが使うものと別のホスト名であることが多い）。
    api_url: str
    runner_settings: RunnerSettings
    variables: Mapping[str, str] = field(default_factory=dict)
    secrets: Mapping[str, Any] | None = None


@dataclass(frozen=True)
class SubmissionOutcome:
    """報告するSiteSubmissionResultと、準備のときにsiteに届いたかどうか。"""

    result: dict[str, Any]
    # 準備中にsiteへ届かなかった理由（秘密を隠したTransportError）。同じログインでほかの投入をしても
    # 同じく失敗する。siteに届いたあとはNone。
    connection_failure: str | None = None


def submission_job_ids(submission: Mapping[str, Any]) -> list[str]:
    return [str(job["job"]["id"]) for job in ordered_jobs(submission)]


def failed_result(job_ids: list[str], error: str) -> dict[str, Any]:
    return {"jobIds": job_ids, "outcome": "failed", "schedulerJobId": None, "error": error}


def _with_retries(operation: Callable[[], Result], *, sleep: Callable[[float], None]) -> Result:
    for attempt in range(SETUP_ATTEMPTS):
        try:
            return operation()
        except LoginRefused:
            raise
        except TransportError:
            if attempt == SETUP_ATTEMPTS - 1:
                raise
            sleep(SETUP_RETRY_SECONDS * (attempt + 1))
    raise AssertionError("setup attempts exhausted")


def submit_to_site(
    submission: Mapping[str, Any],
    *,
    operations: SiteOperations,
    plan: SubmissionPlan,
    masker: SecretMasker,
    sleep: Callable[[float], None] = time.sleep,
) -> SubmissionOutcome:
    """作業ディレクトリを準備し、job shellを1回だけ動かして、報告する内容を返す。"""
    job_ids = submission_job_ids(submission)
    jobs = ordered_jobs(submission)
    target_id = str(submission["target"]["id"])
    # specディレクトリにはJob tokenとレジストリのログイン情報があり、job shellがそれを出力する
    # かもしれない。
    job_tokens = [job["jobToken"] for job in jobs if isinstance(job.get("jobToken"), str)]
    masker = SecretMasker([*masker.secrets, *job_tokens, *secret_values_of(plan.secrets or {})])

    def prepare() -> tuple[str, str, str]:
        runner = operations.ensure_runner(runner_installation(plan.runner_python))
        job_shell = operations.ensure_job_shell(plan.job_shell)
        files = spec_files(
            submission, api_url=plan.api_url, settings=plan.runner_settings, secrets=plan.secrets
        )
        return runner, job_shell, operations.write_spec_directory(job_ids[0], files)

    try:
        runner, job_shell, spec_directory = _with_retries(prepare, sleep=sleep)
        environment = job_shell_environment(
            jobs, spec_directory=spec_directory, runner=runner, target_id=target_id, variables=plan.variables
        )
    except (TransportError, ConfigurationError, OSError) as error:
        reason = masker.mask(str(error))
        return SubmissionOutcome(
            failed_result(job_ids, f"The site could not be prepared: {reason}"),
            connection_failure=reason if isinstance(error, TransportError) else None,
        )
    try:
        completed = operations.run_job_shell(
            job_shell, spec_directory=spec_directory, environment=environment
        )
    except TransportError as error:
        # siteには届いて準備も済んでいるので、これは次のログインについて何も示さない。
        LOGGER.error("Job shell for %s lost its connection: %s", ", ".join(job_ids), masker.mask(str(error)))
        return SubmissionOutcome(
            failed_result(
                job_ids,
                "The connection was lost while the job shell ran; the scheduler may still hold the job "
                f"({masker.mask(str(error))})",
            )
        )
    if completed.exit_code:
        return SubmissionOutcome(
            failed_result(job_ids, job_shell_error(completed.exit_code, completed.stderr, masker))
        )
    try:
        scheduler_id = scheduler_job_id(completed.stdout)
    except JobShellOutputError as error:
        return SubmissionOutcome(failed_result(job_ids, str(error)))
    return SubmissionOutcome(
        {"jobIds": job_ids, "outcome": "submitted", "schedulerJobId": scheduler_id, "error": None}
    )
