"""'artifacts'のDatasetVersionを、Jobのarrayのメンバーで分ける。

n個のarrayのメンバーiは、パス順での位置pがp % n == iとなるファイルを読む。そのためメンバー全体で、
どのファイルもちょうど1回ずつ読む。各メンバーの受け持ち分は、それぞれ別のデータセットのキャッシュの
エントリになる。
"""

from __future__ import annotations

import hashlib
from dataclasses import dataclass
from typing import Any

from ..errors import ConfigurationError


@dataclass(frozen=True)
class DatasetPartition:
    version_id: str
    array_size: int
    array_index: int

    @classmethod
    def for_job(cls, job: dict[str, Any]) -> DatasetPartition | None:
        """Job.datasetPartitionVersionIdのうちJobが受け持つ分。arrayに属さないJobは全部を読む。"""
        version_id = job.get("datasetPartitionVersionId")
        if not version_id:
            return None
        size, index = job.get("arraySize"), job.get("arrayIndex")
        if size is None and index is None:
            return cls(str(version_id), 1, 0)
        if type(size) is not int or type(index) is not int or size < 1 or not 0 <= index < size:
            raise ConfigurationError("Job arraySize and arrayIndex do not describe an array member")
        return cls(str(version_id), size, index)


def partition_files(
    files: list[dict[str, Any]], *, array_size: int, array_index: int
) -> list[dict[str, Any]]:
    # Pythonはstrをコードポイント順に並べる。これはUTF-8のバイト列の順とも一致する。
    ordered = sorted(files, key=lambda file: str(file["path"]))
    return [file for position, file in enumerate(ordered) if position % array_size == array_index]


def partition_cache_key(digest: str, *, array_size: int, array_index: int) -> str:
    # バージョン全体のdigestとメンバーの位置で、その受け持ち分のファイルがちょうど決まる。
    return "p-" + hashlib.sha256(f"{digest}\n{array_size}\n{array_index}".encode()).hexdigest()
