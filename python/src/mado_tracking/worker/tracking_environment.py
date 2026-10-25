"""記録用のクライアントを、workerのProjectと既存のRunにつなぐ。"""

from __future__ import annotations

from ..errors import ConfigurationError
from ..settings import ApiSettings
from .contracts import WorkerJob


def build_tracking_environment(job: WorkerJob, api: ApiSettings) -> dict[str, str]:
    """Jobのコード用の環境変数。workerのtokenではなく、Job tokenで認証する。

    worker tokenはほかのJobを取得でき、Projectの全Runに書き込めるので、
    自分のtokenが無いJobはworker tokenで代用せず、起動しない。
    """
    if job.job_token is None:
        raise ConfigurationError("WorkerJob has no job token; refusing to start its code")
    project_id = job.job["projectId"]
    tracking_uri = f"{api.url.rstrip('/')}/mlflow/projects/{project_id}"
    return {
        "MMT_API_URL": api.url,
        "MMT_API_TOKEN": job.job_token,
        "MMT_PROJECT_ID": project_id,
        "MMT_RUN_ID": job.run["id"],
        "MMT_EXPERIMENT_ID": job.run["experimentId"],
        "MMT_JOB_ID": job.id,
        "MLFLOW_TRACKING_URI": tracking_uri,
        "MLFLOW_REGISTRY_URI": tracking_uri,
        "MLFLOW_TRACKING_TOKEN": job.job_token,
        "MLFLOW_RUN_ID": job.run["id"],
        "MLFLOW_EXPERIMENT_ID": job.run["experimentId"],
    }
