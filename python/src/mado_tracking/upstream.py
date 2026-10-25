"""Jobのコードから上流のRunのArtifactを読む（評価で推論のWAVを読むなど）。

Runに親のRunがあるとき、workerがMMT_UPSTREAM_RUN_IDを設定する。一覧とダウンロードには
MMT_API_TOKENのJob tokenを使う。このtokenは同じProjectのどのRunも読める。
"""

from __future__ import annotations

import os
from collections.abc import Iterator
from contextlib import contextmanager
from pathlib import Path
from typing import Any

from .atomic_files import atomic_output
from .client import Client, path_id
from .errors import ConfigurationError
from .pagination import iterate_listed_items

UPSTREAM_RUN_ID_VARIABLE = "MMT_UPSTREAM_RUN_ID"
# APIのページの最大の大きさに合わせ、大きなRunも少ないリクエストで一覧できるようにする。
ARTIFACT_PAGE_LIMIT = 500


def upstream_run_id() -> str | None:
    """workerから渡された上流のRunのID。このJobに上流が無ければNone。"""
    return os.environ.get(UPSTREAM_RUN_ID_VARIABLE) or None


def list_upstream_artifacts(
    prefix: str | None = None, *, client: Client | None = None
) -> list[dict[str, Any]]:
    """上流のRunのパスごとの最新のArtifact。パスの前置きで絞ることもできる。"""
    run_id = upstream_run_id()
    if run_id is None:
        return []
    with _client_scope(client) as api:
        return _list_latest_artifacts(api, _project_id(), run_id, prefix)


def download_upstream_artifacts(
    destination: str | os.PathLike[str], prefix: str | None = None, *, client: Client | None = None
) -> list[Path]:
    """上流のRunのArtifactを、相対パスを保ったままdestinationの下に保存する。"""
    run_id = upstream_run_id()
    if run_id is None:
        return []
    root = Path(destination)
    project_id = _project_id()
    with _client_scope(client) as api:
        artifacts = _list_latest_artifacts(api, project_id, run_id, prefix)
        # 最初に書き込む前にすべてのパスを確かめ、悪意のある一覧では何も書かないようにする。
        targets = [
            (artifact, root.joinpath(*_safe_artifact_parts(artifact["path"]))) for artifact in artifacts
        ]
        saved = []
        for artifact, target in targets:
            # 接続が切れたらRangeで再開し、ファイルはそろってから初めて現れる。
            with atomic_output(target) as output:
                api.download_artifact_to(project_id, artifact["id"], output)
            saved.append(target)
    return saved


@contextmanager
def _client_scope(client: Client | None) -> Iterator[Client]:
    if client is not None:
        yield client
        return
    with Client() as created:
        yield created


def _project_id() -> str:
    project_id = os.environ.get("MMT_PROJECT_ID")
    if not project_id:
        raise ConfigurationError("MMT_PROJECT_ID is required to read upstream Artifacts")
    return project_id


def _list_latest_artifacts(
    api: Client, project_id: str, run_id: str, prefix: str | None
) -> list[dict[str, Any]]:
    resource = api.project_path(project_id, f"runs/{path_id(run_id)}/artifacts")
    params = {"versions": "latest", "limit": str(ARTIFACT_PAGE_LIMIT)}
    if prefix:
        params["prefix"] = prefix
    artifacts: list[dict[str, Any]] = []
    for artifact in iterate_listed_items(api, resource, params=params, label="Upstream Artifact list"):
        path = artifact.get("path")
        if not isinstance(path, str) or not isinstance(artifact.get("id"), str):
            raise ConfigurationError("API returned an Artifact without id or path")
        artifacts.append(artifact)
    return artifacts


def _safe_artifact_parts(path: str) -> list[str]:
    # 普通の要素だけからなる相対パスは、出力先のディレクトリの外に出られない。
    parts = path.split("/")
    if any(part in {"", ".", ".."} or "\\" in part or "\x00" in part for part in parts):
        raise ConfigurationError(f"Unsafe upstream Artifact path: {path!r}")
    return parts
