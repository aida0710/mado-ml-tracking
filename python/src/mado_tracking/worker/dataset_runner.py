"""入力のDatasetVersionを1つデータセットのキャッシュに入れる、コンピュータ用のrunnerのコマンド。

`dataset-materialize`はJSONを1行読み、（中継するファイルなら）続けてworkerのtarを読む。

    {"key", "source": {"kind": ...}, "files": [...]|null, "totalSize": int|null, "maxCacheBytes": int}

source.kindは`lookup`（完了したエントリか`missing`を報告）、`relay`（続けてtarが来る）、
`api`（Job tokenでダウンロード）、`https`、`s3`、`file`（コンピュータ上の既存のパス。
キャッシュしない）のどれか。失敗は{"error", "retryable"}で答え、workerが壊れた取得元と
途中で止まった取得を見分けられるようにする。`dataset-release`は、Jobが起動前に失敗したときに
そのJobのpinを外す。
"""

from __future__ import annotations

import json
import os
import tarfile
from collections.abc import Callable
from pathlib import Path
from typing import IO, Any

from .dataset_cache import DatasetCache, DatasetCacheError
from .dataset_downloads import (
    DatasetFetchError,
    expected_reference_sha256,
    fetch_api_files,
    fetch_https,
    fetch_s3,
    receive_relayed_tar,
    resolve_file_reference,
)

# ヘッダーは最大MAX_DATASET_FILES件のエントリを運ぶ（1件あたり約150バイト）。
MAX_REQUEST_HEADER_BYTES = 32 * 1024**2


def run_dataset_command(command: str, workspace: Path, stdin: IO[bytes]) -> dict[str, Any]:
    cache = DatasetCache.for_workspace(workspace)
    if command == "dataset-release":
        cache.release(workspace)
        return {"released": True}
    if command != "dataset-materialize":
        raise ValueError("Unknown runner command")
    header = stdin.readline(MAX_REQUEST_HEADER_BYTES + 1)
    if len(header) > MAX_REQUEST_HEADER_BYTES or not header.endswith(b"\n"):
        raise ValueError("Dataset request header exceeds its size limit")
    request = json.loads(header)
    try:
        return materialize(cache, workspace, request, stdin)
    except DatasetFetchError as error:
        return {"error": str(error), "retryable": error.retryable}
    except tarfile.TarError as error:
        # 解析できない中継のtarは、途中で切れたか壊れたもの。
        return {"error": f"Relayed dataset archive is invalid: {error}", "retryable": True}
    except (DatasetCacheError, OSError) as error:
        return {"error": str(error), "retryable": False}


def materialize(
    cache: DatasetCache, workspace: Path, request: dict[str, Any], stdin: IO[bytes]
) -> dict[str, Any]:
    source = request["source"]
    if source["kind"] == "file":
        return {"status": "reference", "path": str(resolve_file_reference(source["uri"]))}
    max_bytes = int(request["maxCacheBytes"])
    files = request.get("files")
    return cache.materialize(
        request["key"],
        files=files,
        total_size=request.get("totalSize"),
        max_bytes=max_bytes,
        workspace=workspace,
        fill=_source_fill(source, files=files, max_bytes=max_bytes, stdin=stdin),
    )


def _source_fill(
    source: dict[str, Any], *, files: list[dict[str, Any]] | None, max_bytes: int, stdin: IO[bytes]
) -> Callable[[Path], list[dict[str, Any]]] | None:
    kind = source["kind"]
    if kind == "lookup":
        return None
    if kind in {"relay", "api"} and files is None:
        raise DatasetFetchError("Relayed and API datasets need their file list")
    listed: list[dict[str, Any]] = files or []

    def relay(data: Path) -> list[dict[str, Any]]:
        receive_relayed_tar(stdin, data, listed)
        return listed

    def api(data: Path) -> list[dict[str, Any]]:
        fetch_api_files(
            data, listed, api_url=source["apiUrl"], project_id=source["projectId"], token=source["token"]
        )
        return listed

    def https(data: Path) -> list[dict[str, Any]]:
        file = fetch_https(data, source["uri"], maximum_bytes=max_bytes)
        expected = expected_reference_sha256(source.get("digest") or "")
        if expected is not None and file["sha256"] != expected:
            raise DatasetFetchError("HTTPS dataset sha256 differs from the DatasetVersion digest")
        return [file]

    def s3(data: Path) -> list[dict[str, Any]]:
        return fetch_s3(data, source["uri"], maximum_bytes=max_bytes, environment=os.environ)

    fills = {"relay": relay, "api": api, "https": https, "s3": s3}
    if kind not in fills:
        raise DatasetFetchError(f"Unknown dataset source: {kind}")
    return fills[kind]
