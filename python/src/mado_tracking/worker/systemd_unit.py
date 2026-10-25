"""workerを動かし続けるsystemdのテンプレートunitを組み立てる。I/Oも秘密情報も無い。"""

from __future__ import annotations

import enum
from dataclasses import dataclass
from pathlib import PurePosixPath

# 1つのテンプレートでホスト上のすべてのworkerを動かす。インスタンス名（%i）がworker ID。
SERVICE_TEMPLATE_NAME = "mado-tracking-worker@.service"
# APIの再起動を待てるだけ長く、停止にWorkersの一覧で気づけるだけ短くする。
RESTART_DELAY_SECONDS = 10


class ServiceScope(enum.Enum):
    USER = "user"
    SYSTEM = "system"


@dataclass(frozen=True)
class WorkerUnitSettings:
    scope: ServiceScope
    python_executable: PurePosixPath
    # `<worker-id>.env`を置く。unitはこれを`<directory>/%i.env`として参照する。
    environment_directory: PurePosixPath
    # ユーザーを切り替えるのはsystemのunitだけ。userのunitは既にその所有者として動く。
    service_user: str | None = None


def instance_unit_name(worker_id: str) -> str:
    return SERVICE_TEMPLATE_NAME.replace("@.", f"@{worker_id}.")


def _require_plain_absolute_path(path: PurePosixPath, label: str) -> None:
    # systemdはExecStartを空白で区切り、`%`と`$`を展開する。そのようなパスは意味が変わってしまう。
    if not path.is_absolute() or any(character in str(path) for character in " \t\n%$\"'\\"):
        raise ValueError(f"{label} must be an absolute path without whitespace, quotes, %, or $")


def render_worker_unit(settings: WorkerUnitSettings) -> str:
    _require_plain_absolute_path(settings.python_executable, "Python executable")
    _require_plain_absolute_path(settings.environment_directory, "Environment directory")
    is_system = settings.scope is ServiceScope.SYSTEM
    if is_system and not settings.service_user:
        raise ValueError("A system unit needs the user the worker runs as")
    unit_lines = [
        "[Unit]",
        "Description=mado ML Tracking worker %i",
    ]
    if is_system:
        # userのマネージャーはsystemのtargetとの順序を指定できないので、
        # ネットワークを待つのはsystemのunitだけ。
        unit_lines += ["Wants=network-online.target", "After=network-online.target"]
    service_lines = [
        "",
        "[Service]",
        "Type=simple",
    ]
    if is_system:
        service_lines.append(f"User={settings.service_user}")
    service_lines += [
        "# The API token lives only in this mode-600 file, never in the unit or in argv.",
        f"EnvironmentFile={settings.environment_directory}/%i.env",
        f"ExecStart={settings.python_executable} -m mado_tracking.worker.cli run",
        "Restart=on-failure",
        f"RestartSec={RESTART_DELAY_SECONDS}",
        # unitに書き込んでおき、あとで編集する人が、既定値に戻してはいけない理由を分かるようにする。
        "# SIGTERM reaches only the worker, which stops monitoring and keeps its journal. Detached Job",
        "# supervisors stay in this cgroup; KillMode=control-group would kill running Jobs on every",
        "# restart or upgrade, while the restarted worker is meant to reattach to them.",
        "KillMode=process",
        "# The worker writes journals and Job tokens; keep new files private.",
        "UMask=0077",
        "NoNewPrivileges=yes",
        "",
        "[Install]",
        f"WantedBy={'multi-user.target' if is_system else 'default.target'}",
    ]
    return "\n".join(unit_lines + service_lines) + "\n"
