"""ドライバーのJob。Jobのコードが、自分のJob tokenで子のJobを始める。

親のJobはallowChildJobsを付けて作られている必要がある。そのコードはProjectとJobを
MMT_PROJECT_IDとMMT_JOB_IDから、Job tokenをMMT_API_TOKENから得るので、`Client()`だけで足りる。
子はそれぞれ冪等キーを付けて作る。再起動したドライバーは、既に作った子を2回始めずに取り戻す。

    spec = ChildJobSpec(name="shard", kind="processing", code_version_id=..., target_id=...)
    jobs = map_shards(client, spec, [{"shard": i} for i in range(64)], key="generate-v1")
"""

from __future__ import annotations

import os
import time
from collections.abc import Mapping, Sequence
from dataclasses import dataclass, field, replace
from typing import TYPE_CHECKING, Any

from .api_paths import path_id
from .errors import ConfigurationError

if TYPE_CHECKING:
    from .client import Client

# CHILD_JOB_WAIT_MAX_SECONDSに合わせる。1回の待機のリクエストは最長でこの時間続く。
CHILD_JOB_WAIT_MAX_SECONDS = 60
MAX_IDEMPOTENCY_KEY_LENGTH = 200


@dataclass(frozen=True)
class ChildJobSpec:
    """1つの子の内容（キーを除いたChildJobCreate）。設定しないオプションはAPIの既定値になる。"""

    name: str
    kind: str
    code_version_id: str
    target_id: str
    experiment_id: str | None = None
    model_version_id: str | None = None
    input_dataset_version_ids: Sequence[str] = ()
    parameters: Mapping[str, Any] = field(default_factory=dict)
    tags: Mapping[str, str] = field(default_factory=dict)
    gpu_ids: Sequence[str] = ()
    gpu_count: int | None = None
    walltime_seconds: int | None = None
    array_size: int | None = None
    dataset_partition_version_id: str | None = None
    max_attempts: int | None = None
    retry_on_failure: bool | None = None
    retry_on_timeout: bool | None = None
    allow_child_jobs: bool | None = None

    def body(self, idempotency_key: str) -> dict[str, Any]:
        if not idempotency_key or len(idempotency_key) > MAX_IDEMPOTENCY_KEY_LENGTH:
            raise ConfigurationError(f"A child Job key is 1 to {MAX_IDEMPOTENCY_KEY_LENGTH} characters")
        body: dict[str, Any] = {
            "idempotencyKey": idempotency_key,
            "name": self.name,
            "kind": self.kind,
            "codeVersionId": self.code_version_id,
            "targetId": self.target_id,
            "parameters": dict(self.parameters),
            "tags": dict(self.tags),
        }
        optional = {
            "experimentId": self.experiment_id,
            "modelVersionId": self.model_version_id,
            "inputDatasetVersionIds": list(self.input_dataset_version_ids) or None,
            "gpuIds": list(self.gpu_ids) or None,
            "gpuCount": self.gpu_count,
            "walltimeSeconds": self.walltime_seconds,
            "arraySize": self.array_size,
            "datasetPartitionVersionId": self.dataset_partition_version_id,
            "maxAttempts": self.max_attempts,
            "retryOnFailure": self.retry_on_failure,
            "retryOnTimeout": self.retry_on_timeout,
            "allowChildJobs": self.allow_child_jobs,
        }
        # 未設定なら送らず、APIに自分の既定値（と親の実験）を使わせる。
        body.update({name: value for name, value in optional.items() if value is not None})
        return body


def driver_job(project_id: str | None = None, parent_job_id: str | None = None) -> tuple[str, str]:
    """ProjectとドライバーのJob自身。引数で渡されなければMMT_PROJECT_IDとMMT_JOB_IDから取る。"""
    project = project_id or os.environ.get("MMT_PROJECT_ID")
    job = parent_job_id or os.environ.get("MMT_JOB_ID")
    if not project or not job:
        raise ConfigurationError("Driver calls need MMT_PROJECT_ID and MMT_JOB_ID (run them inside a Job)")
    return project, job


def _children_path(client: Client, project_id: str, job_id: str, resource: str = "") -> str:
    return client.project_path(
        project_id, f"jobs/{path_id(job_id)}/children" + (f"/{resource}" if resource else "")
    )


def submit_child_job(
    client: Client,
    spec: ChildJobSpec,
    *,
    key: str,
    project_id: str | None = None,
    parent_job_id: str | None = None,
) -> dict[str, Any]:
    """子のJob（spec.array_sizeを設定したならarray）を作り、ChildJobCreatedを返す。

    キーが以前に使われていれば`created`はfalseになる。そのとき応答は最初のリクエストが作ったものを
    示すので、応答が失われたあとや再起動のあとに送り直しても安全。
    """
    project, job = driver_job(project_id, parent_job_id)
    return client.request("POST", _children_path(client, project, job), json=spec.body(key), retryable=True)


def list_child_jobs(
    client: Client, *, project_id: str | None = None, parent_job_id: str | None = None
) -> list[dict[str, Any]]:
    project, job = driver_job(project_id, parent_job_id)
    items = client.request("GET", _children_path(client, project, job), retryable=True).get("items")
    if not isinstance(items, list) or not all(isinstance(item, dict) for item in items):
        raise ConfigurationError("Child Job list response must contain items")
    return items


def wait_for_child_jobs(
    client: Client,
    *,
    timeout_seconds: float | None = None,
    project_id: str | None = None,
    parent_job_id: str | None = None,
) -> dict[str, Any]:
    """すべての子が終わる（またはtimeout_secondsが過ぎる）まで待ち、ChildJobWaitを返す。

    各リクエストは最長CHILD_JOB_WAIT_MAX_SECONDSの1回のlong pollなので、何時間も待つドライバーでも、
    それより長くリクエストを開いたままにしない。
    """
    project, job = driver_job(project_id, parent_job_id)
    deadline = None if timeout_seconds is None else time.monotonic() + timeout_seconds
    while True:
        remaining = CHILD_JOB_WAIT_MAX_SECONDS if deadline is None else deadline - time.monotonic()
        seconds = max(1, min(CHILD_JOB_WAIT_MAX_SECONDS, int(remaining)))
        waited = client.request(
            "GET",
            _children_path(client, project, job, "wait"),
            params={"timeoutSeconds": str(seconds)},
            retryable=True,
            # サーバーはリクエストを最長`seconds`秒保持する。クライアントはそれより少し長く待つ。
            timeout=seconds + CHILD_JOB_WAIT_MAX_SECONDS / 2,
        )
        if waited.get("done") is True or (deadline is not None and time.monotonic() >= deadline):
            return waited


def map_shards(
    client: Client,
    spec: ChildJobSpec,
    shards: Sequence[Mapping[str, Any]],
    *,
    key: str,
    wait: bool = True,
    timeout_seconds: float | None = None,
    project_id: str | None = None,
    parent_job_id: str | None = None,
) -> list[dict[str, Any]]:
    """shardごとに1つの子を作り、そのparameterをshardの値で更新する。キーは`<key>:<index>`。

    wait=Trueなら、すべての子が終わってから返る。返すJobは子の今の状態で、shardの順に並ぶ
    （arrayの子は、そのメンバーをすべて含める）。
    """
    project, job = driver_job(project_id, parent_job_id)
    created_ids: list[str] = []
    for index, shard in enumerate(shards):
        child = replace(spec, name=f"{spec.name}-{index}", parameters={**spec.parameters, **dict(shard)})
        created = submit_child_job(client, child, key=f"{key}:{index}", project_id=project, parent_job_id=job)
        created_ids.extend(str(item["id"]) for item in created.get("jobs", []))
    if wait:
        wait_for_child_jobs(client, timeout_seconds=timeout_seconds, project_id=project, parent_job_id=job)
    current = {
        str(item["id"]): item for item in list_child_jobs(client, project_id=project, parent_job_id=job)
    }
    return [current[job_id] for job_id in created_ids if job_id in current]
