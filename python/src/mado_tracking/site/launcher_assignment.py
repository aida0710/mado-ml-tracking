"""claimする投入のほかに、APIがlauncherに渡す仕事。

GET /launcher/configは、このlauncherに割り当てたsite、鍵、接続確認を並べる。launcherはpollの
始めに毎回これを読むので、画面で編集したsiteは次のpollから効く。claimした投入は、引き続き
そのclaimの時点の設定を持つ（site_settings.py）。割り当ての設定は、接続確認と取り消し
（スケジューラの待ち行列から外すJob、POST /launcher/site-submissions/cancellations）に使う。
"""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass
from typing import Any

from ..errors import ConfigurationError
from .api_documents import DocumentReader
from .site_settings import SiteSettings, SubmissionAccount

# SiteKeyStatus。launcherが公開鍵を公開するまでは'requested'。
KEY_REQUESTED = "requested"
KEY_STATUSES = (KEY_REQUESTED, "ready")


@dataclass(frozen=True)
class AssignedSite:
    target_id: str
    name: str
    settings: SiteSettings

    @classmethod
    def parse(cls, reader: DocumentReader) -> AssignedSite:
        target = reader.child("target")
        return cls(
            target_id=target.uuid("id"),
            name=target.text("name"),
            settings=SiteSettings.parse(reader.child("settings")),
        )

    @property
    def label(self) -> str:
        """ログでのsiteの呼び方。人向けの名前と、探すためのID。"""
        return f"{self.name} ({self.target_id})"


@dataclass(frozen=True)
class LauncherKey:
    """このlauncherの有効な鍵。siteの共用アカウントの鍵か、ある人が自分用に持つ鍵。"""

    id: str
    target_id: str
    status: str
    # APIが持つ公開鍵。launcherが公開するまではNone。
    public_key: str | None

    @classmethod
    def parse(cls, reader: DocumentReader) -> LauncherKey:
        status = reader.text("status")
        if status not in KEY_STATUSES:
            raise ConfigurationError(f"{reader.label}.status must be one of {', '.join(KEY_STATUSES)}")
        return cls(
            id=reader.uuid("id"),
            target_id=reader.uuid("targetId"),
            status=status,
            public_key=reader.optional_text("publicKey"),
        )

    @property
    def requested(self) -> bool:
        return self.status == KEY_REQUESTED


@dataclass(frozen=True)
class ConnectionCheck:
    """そのアカウントとして、その鍵で1回ログインし`true`を実行する。何も投入しない。"""

    id: str
    target_id: str
    account: SubmissionAccount

    @classmethod
    def parse(cls, reader: DocumentReader) -> ConnectionCheck:
        return cls(
            id=reader.uuid("id"),
            target_id=reader.uuid("targetId"),
            account=SubmissionAccount.parse(reader.child("account")),
        )


@dataclass(frozen=True)
class SchedulerCancellation:
    """スケジューラの待ち行列で待っている間に終わったJobのうち、このlauncherが投入したもの。"""

    job_id: str
    target_id: str
    scheduler_job_id: str
    # 取り消しコマンドを実行するアカウント。APIがもう知らなければ''で、鍵も無い。
    account: SubmissionAccount

    @classmethod
    def parse(cls, document: Any) -> SchedulerCancellation:
        reader = DocumentReader(document, label="cancellation")
        return cls(
            job_id=reader.uuid("jobId"),
            target_id=reader.uuid("targetId"),
            scheduler_job_id=reader.text("schedulerJobId"),
            account=SubmissionAccount.parse(reader.child("account")),
        )


@dataclass(frozen=True)
class LauncherAssignment:
    launcher_name: str
    sites: Mapping[str, AssignedSite]
    keys: tuple[LauncherKey, ...]
    checks: tuple[ConnectionCheck, ...]

    @classmethod
    def parse(cls, document: Any) -> LauncherAssignment:
        reader = DocumentReader(document, label="launcher configuration")
        sites = [AssignedSite.parse(site) for site in reader.children("sites")]
        return cls(
            launcher_name=reader.child("launcher").text("name"),
            sites={site.target_id: site for site in sites},
            keys=tuple(LauncherKey.parse(key) for key in reader.children("keys")),
            checks=tuple(ConnectionCheck.parse(check) for check in reader.children("checks")),
        )
