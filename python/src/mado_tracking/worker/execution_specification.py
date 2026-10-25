"""1つのJobのためにコンピュータ側のrunnerが実行する指示。そのJobのWorkerJobから作る。

workerはこれをspec.jsonとしてSSHのrunnerに送る。siteのrunnerは計算ノードの上でこれを作る。
どちらもexecute_registered_codeに渡すので、Jobから見えるファイルと変数は同じになる。
"""

from __future__ import annotations

from typing import Any

from ..settings import ApiSettings
from .container_layout import resume_checkpoint_document, upstream_run_document
from .contracts import WorkerJob
from .tracking_environment import build_tracking_environment
from .workflow_context import workflow_context_fields


def build_execution_specification(
    job: WorkerJob,
    *,
    api: ApiSettings,
    gpu_ids: list[str],
    install_dependencies: bool,
    cancel_grace_seconds: float,
    max_output_files: int,
) -> dict[str, Any]:
    snapshot = job.execution_snapshot
    context: dict[str, Any] = {
        "jobId": job.id,
        "runId": job.run["id"],
        "projectId": job.job["projectId"],
        "kind": job.run["kind"],
        "parameters": job.run["parameters"],
        "modelVersion": job.model_version,
        "inputDatasets": job.input_datasets,
        "codeVersionId": job.code_version["id"],
        "gpuIds": gpu_ids,
        "executionMode": snapshot["mode"],
        "upstreamRun": upstream_run_document(job.run, job.model_version),
        "resumeCheckpoint": resume_checkpoint_document(job.resume_checkpoint),
    }
    # フックの入力は、フックが始めたJobにだけ現れる。ほかのJobのcontextは変わらない。
    if job.input_checkpoint is not None:
        context["inputCheckpoint"] = resume_checkpoint_document(job.input_checkpoint)
    if job.trigger_payload is not None:
        context["triggerPayload"] = job.trigger_payload
    context.update(workflow_context_fields(job.run.get("environment")))
    return {
        "jobId": job.id,
        "leaseId": job.lease_id,
        "codeVersion": {**job.code_version, "runtime": snapshot["runtime"]},
        "executionSnapshot": snapshot,
        "runExecution": {name: job.run[name] for name in ("executionMode", "executionSnapshot")},
        "gpuIds": gpu_ids,
        "context": context,
        "sdkEnvironment": build_tracking_environment(job, api),
        "installDependencies": install_dependencies,
        "cancelGraceSeconds": cancel_grace_seconds,
        "maxOutputFiles": max_output_files,
    }
