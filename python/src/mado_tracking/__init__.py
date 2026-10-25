"""mado ML TrackingのPython SDK。"""

import os
from typing import Any

from .client import Client, ResumeMode, start_run_offline
from .driver import ChildJobSpec, list_child_jobs, map_shards, submit_child_job, wait_for_child_jobs
from .errors import ApiError, ConfigurationError
from .execution_runtime import (
    DockerRuntime,
    ExecutionRuntime,
    ExecutionRuntimeKind,
    PythonRuntime,
    SifRuntime,
)
from .execution_snapshot import ExecutionMode
from .media import Audio, Image, Table, Video, artifact_reference
from .offline.transport import RunMode, resolve_mode
from .run import Run
from .sweeps import SweepsClient, trial_parameters
from .upstream import download_upstream_artifacts, list_upstream_artifacts, upstream_run_id

__all__ = [
    "ApiError",
    "Audio",
    "ChildJobSpec",
    "Client",
    "ConfigurationError",
    "DockerRuntime",
    "ExecutionMode",
    "ExecutionRuntime",
    "ExecutionRuntimeKind",
    "Image",
    "PythonRuntime",
    "ResumeMode",
    "Run",
    "RunMode",
    "SifRuntime",
    "SweepsClient",
    "Table",
    "Video",
    "artifact_reference",
    "download_upstream_artifacts",
    "list_child_jobs",
    "list_upstream_artifacts",
    "map_shards",
    "start_run",
    "submit_child_job",
    "trial_parameters",
    "upstream_run_id",
    "wait_for_child_jobs",
]


def start_run(
    *,
    project_id: str | None = None,
    experiment_id: str | None = None,
    experiment_name: str | None = None,
    name: str | None = None,
    kind: str = "training",
    mode: RunMode | None = None,
    **options: Any,
) -> Run:
    """既存のworkerのRunを使うか、Runを作るか再開する（オプションはClient.start_runを参照）。

    experiment_nameは名前で実験を選び、無ければ作る。オフラインのRunにはMMT_API_URLも
    MMT_API_TOKENも要らず、experiment_idかMMT_EXPERIMENT_IDを使う。
    """
    if resolve_mode(mode, os.environ) == "offline":
        return start_run_offline(
            project_id=project_id,
            experiment_id=experiment_id,
            experiment_name=experiment_name,
            name=name,
            kind=kind,
            **options,
        )
    client = Client()
    try:
        run = client.start_run(
            project_id=project_id,
            experiment_id=experiment_id,
            experiment_name=experiment_name,
            name=name,
            kind=kind,
            mode=mode,
            **options,
        )
    except BaseException:
        client.close()
        raise
    run.close_client_on_exit = True
    return run
