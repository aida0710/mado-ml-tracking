"""APIのWorkerTargetCheck。このworkerがどのリクエストを取得し、それが何を求めているか。"""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass
from typing import Any

from ..errors import ConfigurationError

CONNECTION = "connection"
DIRECTORY_LISTING = "directory_listing"
# 契約のTARGET_CHECK_KINDS。このworkerが実行するもの。
TARGET_CHECK_KINDS = (CONNECTION, DIRECTORY_LISTING)
# TargetCheckResultはホストと、Pythonとディレクトリの候補を含む。
RESULT_VERSION = 2


@dataclass(frozen=True)
class ClaimedTargetCheck:
    check_id: str
    lease_id: str
    target: dict[str, Any]
    kind: str
    # 一覧を読むディレクトリ。リクエストのとおり。接続の確認ではNone。
    directory_path: str | None


def is_assigned_to(check: dict[str, Any], worker_id: str) -> bool:
    assigned = check.get("assignedWorker")
    return isinstance(assigned, dict) and assigned.get("workerId") == worker_id


def parse_claimed_target_check(
    item: Any, *, worker_id: str, target_ids: Sequence[str]
) -> ClaimedTargetCheck | None:
    if item is None:
        return None
    if (
        not isinstance(item, dict)
        or not isinstance(item.get("leaseId"), str)
        or not isinstance(check := item.get("check"), dict)
        or not isinstance(check.get("id"), str)
        or not isinstance(target := item.get("target"), dict)
    ):
        raise ConfigurationError("Target check claim response is invalid")
    # このworkerに割り当てられたリクエストは、MMT_WORKER_TARGET_IDSに無いコンピュータ
    # （追加中のもの）を指すことがある。それ以外は、このworkerのコンピュータでなければならない。
    if target.get("id") not in target_ids and not is_assigned_to(check, worker_id):
        raise ConfigurationError("Target check claim names a computer this worker is not in charge of")
    kind = item.get("kind")
    directory_path = item.get("directoryPath")
    if kind not in TARGET_CHECK_KINDS or (
        kind == DIRECTORY_LISTING and (not isinstance(directory_path, str) or not directory_path)
    ):
        raise ConfigurationError("Target check claim response has an unknown kind or no directory")
    return ClaimedTargetCheck(
        check_id=check["id"],
        lease_id=item["leaseId"],
        target=target,
        kind=kind,
        directory_path=directory_path if kind == DIRECTORY_LISTING else None,
    )
