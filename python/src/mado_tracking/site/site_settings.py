"""APIが渡すsiteの設定と、claimした1つの投入のSubmissionPlan。

どのSiteSubmissionも、claimした時点のsiteの設定（`settings`）、そのJobが記録したjob shellの
バージョン（`jobShell`）、どのアカウントで動かすか（`account`。SSHのユーザーと、作業ディレクトリ・
変数。後の2つはsiteの値に本人の値を重ねたもの）を持つ。そのため1つの投入で2つの時点の設定が
混ざることは無い。`mado-tracking submit`は、claimする前にGET /manual-submissions/sites/:idから
同じ形を読む。
"""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass, field
from typing import Any

from .api_documents import DocumentReader
from .spec_directory import RunnerSettings
from .submission import SubmissionPlan


@dataclass(frozen=True)
class SiteConnection:
    """launcherがログインする先（自動投入のsiteだけ）。"""

    host: str
    port: int
    # 経由する各ホストの[user@]host[:port]を順に並べたもの。
    jump_hosts: tuple[str, ...]
    # 接続先と経由する全ホストのknown_hostsの行。これ以外のホスト鍵は受け入れない。
    known_hosts: str

    @classmethod
    def parse(cls, reader: DocumentReader) -> SiteConnection:
        return cls(
            host=reader.text("host"),
            port=reader.integer("port"),
            jump_hosts=reader.text_list("jumpHosts"),
            known_hosts=reader.text("knownHosts"),
        )


@dataclass(frozen=True)
class SiteSettings:
    """siteの全体設定のうち、launcherや`mado-tracking submit`が使う部分。"""

    connection: SiteConnection | None
    runner_python: str
    # 計算ノードから見たAPIのURL。Noneなら、launcherかsubmitが使うURLを使う。
    runner_api_url: str | None
    # キューにある1つのスケジューラのジョブ（MMT_SCHEDULER_JOB_ID）を取り除くシェルの文。
    # キューが無ければNone。
    cancel_command: str | None
    gpu_assignment: str
    lease_gpu_ids: tuple[str, ...]
    cancel_grace_seconds: float
    max_output_files: int
    max_active_submissions: int

    @classmethod
    def parse(cls, reader: DocumentReader) -> SiteSettings:
        connection = reader.optional_child("connection")
        return cls(
            connection=SiteConnection.parse(connection) if connection is not None else None,
            runner_python=reader.text("runnerPython"),
            runner_api_url=reader.optional_text("runnerApiUrl"),
            cancel_command=reader.optional_text("cancelCommand"),
            gpu_assignment=reader.text("gpuAssignment"),
            lease_gpu_ids=reader.text_list("leaseGpuIds"),
            cancel_grace_seconds=reader.number("cancelGraceSeconds"),
            max_output_files=reader.integer("maxOutputFiles"),
            max_active_submissions=reader.integer("maxActiveSubmissions"),
        )


@dataclass(frozen=True)
class SubmissionAccount:
    """1回のjob shellの呼び出しをどのアカウントで動かすか。その作業ディレクトリと変数も持つ。"""

    # launcherがログインするSSHのユーザー。手動投入では''で、投入した人のアカウントで動く。
    account_name: str
    work_directory: str
    # siteの変数に本人の変数を重ねたもの。
    variables: Mapping[str, str]
    # ログインに使うlauncherの鍵。手動投入ではNone。
    key_id: str | None

    @classmethod
    def parse(cls, reader: DocumentReader) -> SubmissionAccount:
        return cls(
            account_name=reader.text("accountName"),
            work_directory=reader.text("workDirectory"),
            variables=reader.text_map("variables"),
            key_id=reader.optional_uuid("keyId"),
        )


@dataclass(frozen=True)
class JobShell:
    """siteのjob shellの1つのバージョン。画面で保存したバージョンは二度と変わらない。"""

    version: int
    content: bytes = field(repr=False)

    @classmethod
    def parse(cls, reader: DocumentReader) -> JobShell:
        return cls(version=reader.integer("version"), content=reader.text("content").encode())


@dataclass(frozen=True)
class SubmissionSetup:
    """claimした1つのSiteSubmissionの投入方法。siteの設定、job shell、アカウント。"""

    settings: SiteSettings
    job_shell: JobShell
    account: SubmissionAccount

    @classmethod
    def of(cls, submission: Mapping[str, Any]) -> SubmissionSetup:
        reader = DocumentReader(submission, label="submission")
        return cls(
            settings=SiteSettings.parse(reader.child("settings")),
            job_shell=JobShell.parse(reader.child("jobShell")),
            account=SubmissionAccount.parse(reader.child("account")),
        )

    def plan(self, *, api_url: str, secrets: Mapping[str, Any] | None = None) -> SubmissionPlan:
        """`api_url`は呼び出し側から見たAPIのURL。runnerApiUrlがあれば、runnerにはそちらを渡す。"""
        return SubmissionPlan(
            job_shell=self.job_shell.content,
            runner_python=self.settings.runner_python,
            api_url=self.settings.runner_api_url or api_url,
            runner_settings=RunnerSettings(
                work_directory=self.account.work_directory,
                gpu_assignment=self.settings.gpu_assignment,
                gpu_ids=self.settings.lease_gpu_ids,
                cancel_grace_seconds=self.settings.cancel_grace_seconds,
                max_output_files=self.settings.max_output_files,
            ),
            variables=self.account.variables,
            secrets=secrets,
        )


@dataclass(frozen=True)
class ManualSiteConfiguration:
    """GET /manual-submissions/sites/:id。`mado-tracking submit`がclaimする前に確かめる内容。"""

    target_name: str
    # siteの所有者がjob shellを保存するまではNone。その間にclaimしても、
    # 待っているJobを失敗させるだけ。
    job_shell: JobShell | None
    # このsiteでの、呼び出した本人の作業ディレクトリと変数。
    account: SubmissionAccount

    @classmethod
    def parse(cls, document: Any) -> ManualSiteConfiguration:
        reader = DocumentReader(document, label="site configuration")
        job_shell = reader.optional_child("jobShell")
        return cls(
            target_name=reader.child("target").text("name"),
            job_shell=JobShell.parse(job_shell) if job_shell is not None else None,
            account=SubmissionAccount.parse(reader.child("account")),
        )
