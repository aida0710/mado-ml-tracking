"""オフラインのRunをディスクに置くspool。SDKが書き、`mado-tracking sync`が読み戻す。

``<offline dir>/<runId>/``の構成（ファイルはすべてモード600、ディレクトリは700、tokenは
どこにも置かない）。

- ``run.json``: ``PUT /sync/runs/:runId``でRunを作るのに要るもの。
- ``batches/<sequence>-<batchId>.jsonl``: 1行に1レコード（メトリクスの点、ログ、parameter、
  タグ）。1ファイルが1回の``POST /sync/runs/:runId/batches``になる。
- ``artifacts.jsonl``: 記録したファイルごとの``{path, sha256, size, mimeType, copied, localPath}``。
  写しは``artifact-files/<sha256>``に置き、``localPath``はrunのディレクトリからの相対パス。
  そのため、ディレクトリごと別のマシンへ運んでそこでsyncできる。
- ``media.jsonl``: メディアごとの``{id, key, step, kind, artifactPath, caption, metadata}``。
- ``status.json``: 終了状態。終了状態のハンドラがすべてのArtifactを見られるよう、最後に送る。
- ``sync-state.json``: 既にAPIへ届いたもの（syncとautoモードが書く）。
"""

from __future__ import annotations

import fcntl
import hashlib
import json
import os
import re
import shutil
import tempfile
import threading
from collections.abc import Iterator, Mapping
from contextlib import contextmanager
from dataclasses import dataclass, field
from pathlib import Path
from typing import IO, Any, BinaryIO
from uuid import uuid4

from ..errors import ConfigurationError

SPOOL_FORMAT_VERSION = 1
# ネットワークファイルシステムではfsyncが遅い。電源断で失うのは、最大でこの行数の直近の行。
SPOOL_FSYNC_EVERY = 50
# レコードの混ざり方によらず、APIの1バッチあたりのメトリクス10000件・ログ10000件を下回る。
SPOOL_BATCH_MAX_RECORDS = 5000
# APIのバッチ本文の上限32MiBの半分にして、JSONの外枠の分の余裕を残す。
SPOOL_BATCH_MAX_BYTES = 16 * 1024 * 1024
FILE_MODE = 0o600
DIRECTORY_MODE = 0o700
COPY_CHUNK_BYTES = 1024 * 1024

RUN_FILE = "run.json"
BATCH_DIRECTORY = "batches"
ARTIFACT_FILE_DIRECTORY = "artifact-files"
ARTIFACTS_FILE = "artifacts.jsonl"
MEDIA_FILE = "media.jsonl"
STATUS_FILE = "status.json"
SYNC_STATE_FILE = "sync-state.json"
WRITER_LOCK_FILE = "writer.lock"
UPLOAD_SESSION_DIRECTORY = "upload-sessions"

BATCH_FILE_NAME = re.compile(r"^(?P<sequence>\d{8})-(?P<batch_id>[0-9a-f-]{36})\.jsonl$")


class SpoolError(ConfigurationError):
    """spoolが無い、読めない、または参照しているファイルと合わなくなった。"""


def default_offline_directory() -> Path:
    """MMT_OFFLINE_DIR、無ければ``$XDG_DATA_HOME/mado-tracking/offline``
    （``~/.local/share/...``）。"""
    if configured := os.environ.get("MMT_OFFLINE_DIR"):
        return Path(configured).expanduser()
    data_home = os.environ.get("XDG_DATA_HOME") or str(Path.home() / ".local" / "share")
    return Path(data_home) / "mado-tracking" / "offline"


@dataclass(frozen=True)
class SpoolRunRecord:
    """run.jsonの中身。フィールド名はSyncRunCreateに合わせる。"""

    run_id: str
    project_id: str
    experiment_id: str
    name: str
    kind: str
    started_at: str
    parameters: dict[str, Any] = field(default_factory=dict)
    tags: dict[str, str] = field(default_factory=dict)
    parent_run_id: str | None = None
    origin: str | None = None
    api_url: str | None = None

    def to_json(self) -> dict[str, Any]:
        return {
            "version": SPOOL_FORMAT_VERSION,
            "runId": self.run_id,
            "projectId": self.project_id,
            "apiUrl": self.api_url,
            "experimentId": self.experiment_id,
            "name": self.name,
            "kind": self.kind,
            "parameters": self.parameters,
            "tags": self.tags,
            "parentRunId": self.parent_run_id,
            "startedAt": self.started_at,
            "origin": self.origin,
        }

    @classmethod
    def from_json(cls, content: object) -> SpoolRunRecord:
        if not isinstance(content, dict) or content.get("version") != SPOOL_FORMAT_VERSION:
            raise SpoolError("run.json has an unsupported format")
        try:
            return cls(
                run_id=str(content["runId"]),
                project_id=str(content["projectId"]),
                api_url=content.get("apiUrl"),
                experiment_id=str(content["experimentId"]),
                name=str(content["name"]),
                kind=str(content["kind"]),
                parameters=dict(content.get("parameters") or {}),
                tags=dict(content.get("tags") or {}),
                parent_run_id=content.get("parentRunId"),
                started_at=str(content["startedAt"]),
                origin=content.get("origin"),
            )
        except KeyError as error:
            raise SpoolError(f"run.json is missing {error.args[0]}") from None

    def sync_create_body(self) -> dict[str, Any]:
        """PUT /projects/:p/sync/runs/:runIdの本文。"""
        return {
            "experimentId": self.experiment_id,
            "name": self.name,
            "kind": self.kind,
            "parameters": self.parameters,
            "tags": self.tags,
            "parentRunId": self.parent_run_id,
            "startedAt": self.started_at,
            "origin": self.origin,
        }


@dataclass
class SyncState:
    """1つのrunのディレクトリのsyncの進み具合。やり直したとき、前回止まったところから続ける。"""

    run_created: bool = False
    sent_batch_ids: list[str] = field(default_factory=list)
    # artifacts.jsonlの行番号 -> Artifactのid。"present"の項目は既にAPIにあったもの。
    artifact_ids: dict[str, str | None] = field(default_factory=dict)
    sent_media_ids: list[str] = field(default_factory=list)
    status_sent: bool = False
    completed: bool = False

    def to_json(self) -> dict[str, Any]:
        return {
            "version": SPOOL_FORMAT_VERSION,
            "runCreated": self.run_created,
            "sentBatchIds": self.sent_batch_ids,
            "artifactIds": self.artifact_ids,
            "sentMediaIds": self.sent_media_ids,
            "statusSent": self.status_sent,
            "completed": self.completed,
        }

    @classmethod
    def load(cls, run_directory: Path) -> SyncState:
        path = run_directory / SYNC_STATE_FILE
        if not path.exists():
            return cls()
        content = _read_json(path)
        if not isinstance(content, dict) or content.get("version") != SPOOL_FORMAT_VERSION:
            raise SpoolError(f"{path} has an unsupported format")
        return cls(
            run_created=bool(content.get("runCreated")),
            sent_batch_ids=list(content.get("sentBatchIds") or []),
            artifact_ids=dict(content.get("artifactIds") or {}),
            sent_media_ids=list(content.get("sentMediaIds") or []),
            status_sent=bool(content.get("statusSent")),
            completed=bool(content.get("completed")),
        )

    def save(self, run_directory: Path) -> None:
        write_private_json(run_directory / SYNC_STATE_FILE, self.to_json())


@dataclass(frozen=True)
class SpoolBatch:
    sequence: int
    batch_id: str
    path: Path


@dataclass(frozen=True)
class SpoolArtifact:
    line_number: int
    path: str
    sha256: str
    size: int
    mime_type: str
    copied: bool
    local_path: Path


@dataclass(frozen=True)
class SpoolStatus:
    batch_id: str
    status: str
    ended_at: str
    error: str | None


def write_private_json(path: Path, content: object) -> None:
    """パスをモード600で不可分に置き換える。クラッシュしても状態ファイルが半端に残らない。"""
    path.parent.mkdir(mode=DIRECTORY_MODE, parents=True, exist_ok=True)
    descriptor, temporary = tempfile.mkstemp(dir=path.parent, prefix=f".{path.name}.", suffix=".partial")
    try:
        with os.fdopen(descriptor, "w", encoding="utf-8") as output:
            json.dump(content, output, ensure_ascii=False)
            output.flush()
            os.fsync(output.fileno())
        os.chmod(temporary, FILE_MODE)
        os.replace(temporary, path)
    finally:
        Path(temporary).unlink(missing_ok=True)


def _read_json(path: Path) -> object:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError) as error:
        raise SpoolError(f"Cannot read {path}: {error}") from None


def _open_private_append(path: Path) -> IO[str]:
    descriptor = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_APPEND, FILE_MODE)
    return os.fdopen(descriptor, "a", encoding="utf-8")


def _append_durable_line(path: Path, record: Mapping[str, Any]) -> None:
    with _open_private_append(path) as output:
        output.write(json.dumps(record, ensure_ascii=False) + "\n")
        output.flush()
        os.fsync(output.fileno())


class RunSpool:
    """1つのオフラインのRunのレコードを書き足す。スレッドセーフ（システムメトリクスは専用の
    スレッドから書く）。

    writerは生きている間writer.lockの排他ロックを持ち、syncが記録中のRunを飛ばせるようにする。
    """

    def __init__(self, run_directory: Path, record: SpoolRunRecord):
        self.directory = run_directory
        self.record = record
        self._lock = threading.Lock()
        self._batch: IO[str] | None = None
        self._batch_records = 0
        self._batch_bytes = 0
        self._unsynced_lines = 0
        self._next_sequence = 1 + max((batch.sequence for batch in list_batches(run_directory)), default=0)
        lock_descriptor = os.open(run_directory / WRITER_LOCK_FILE, os.O_RDWR | os.O_CREAT, FILE_MODE)
        try:
            fcntl.flock(lock_descriptor, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except OSError:
            os.close(lock_descriptor)
            raise SpoolError(f"Another process is recording into {run_directory}") from None
        self._writer_lock: int | None = lock_descriptor

    @classmethod
    def create(cls, root: Path, record: SpoolRunRecord, *, run_created: bool = False) -> RunSpool:
        """``root/<runId>``を作る。run_created=Trueは、APIが既にRunを持っていることを記録する。"""
        run_directory = root / record.run_id
        if (run_directory / RUN_FILE).exists():
            raise SpoolError(f"An offline Run already exists in {run_directory}")
        root.mkdir(mode=DIRECTORY_MODE, parents=True, exist_ok=True)
        run_directory.mkdir(mode=DIRECTORY_MODE, exist_ok=True)
        (run_directory / BATCH_DIRECTORY).mkdir(mode=DIRECTORY_MODE, exist_ok=True)
        if run_created:
            SyncState(run_created=True).save(run_directory)
        # run.jsonは最後に書く。これがあることで、spoolのディレクトリが完成していると分かる。
        write_private_json(run_directory / RUN_FILE, record.to_json())
        return cls(run_directory, record)

    def append_records(self, records: list[dict[str, Any]]) -> None:
        if not records:
            return
        with self._lock:
            for record in records:
                self._append_batch_line(record)

    def append_metrics(self, points: list[dict[str, Any]]) -> None:
        self.append_records([{"type": "metric", **point} for point in points])

    def append_params(self, parameters: Mapping[str, Any]) -> None:
        self.append_records([{"type": "params", "params": dict(parameters)}])

    def append_tags(self, tags: Mapping[str, str]) -> None:
        self.append_records([{"type": "tags", "tags": dict(tags)}])

    def append_logs(self, entries: list[dict[str, Any]]) -> None:
        self.append_records([{"type": "log", **entry} for entry in entries])

    def write_status(self, status: str, *, ended_at: str, error: str | None = None) -> None:
        with self._lock:
            self._close_batch()
            write_private_json(
                self.directory / STATUS_FILE,
                {"batchId": str(uuid4()), "status": status, "endedAt": ended_at, "error": error},
            )

    def add_artifact(
        self, source: Path | BinaryIO, *, path: str, mime_type: str, copy: bool = True
    ) -> dict[str, Any]:
        """sourceをspoolに写す。copy=Falseなら、置き場所とsha256だけを覚える。"""
        if copy:
            sha256, size, local_path = self._copy_into_spool(source)
        elif isinstance(source, Path):
            sha256, size = file_digest(source)
            local_path = str(source.resolve())
        else:
            raise ConfigurationError("copy=False needs a file path; a stream must be copied")
        entry = {
            "path": path,
            "sha256": sha256,
            "size": size,
            "mimeType": mime_type,
            "copied": copy,
            "localPath": local_path,
        }
        with self._lock:
            _append_durable_line(self.directory / ARTIFACTS_FILE, entry)
        return {"path": path, "sha256": sha256, "size": size, "offline": True}

    def add_media(
        self,
        *,
        key: str,
        step: int,
        kind: str,
        artifact_path: str,
        caption: str | None = None,
        metadata: Mapping[str, Any] | None = None,
        media_id: str | None = None,
    ) -> dict[str, Any]:
        """add_artifactでartifact_pathにファイルを記録したメディアを、1件記録する。"""
        entry = {
            "id": media_id or str(uuid4()),
            "key": key,
            "step": step,
            "kind": kind,
            "artifactPath": artifact_path,
            "caption": caption,
            "metadata": dict(metadata or {}),
        }
        with self._lock:
            _append_durable_line(self.directory / MEDIA_FILE, entry)
        return entry

    def close(self) -> None:
        with self._lock:
            self._close_batch()
            if self._writer_lock is not None:
                os.close(self._writer_lock)
                self._writer_lock = None

    def _append_batch_line(self, record: dict[str, Any]) -> None:
        line = json.dumps(record, ensure_ascii=False) + "\n"
        if self._batch is not None and (
            self._batch_records >= SPOOL_BATCH_MAX_RECORDS
            or self._batch_bytes + len(line) > SPOOL_BATCH_MAX_BYTES
        ):
            self._close_batch()
        if self._batch is None:
            name = f"{self._next_sequence:08d}-{uuid4()}.jsonl"
            self._next_sequence += 1
            self._batch = _open_private_append(self.directory / BATCH_DIRECTORY / name)
            self._batch_records = 0
            self._batch_bytes = 0
        self._batch.write(line)
        self._batch.flush()
        self._batch_records += 1
        self._batch_bytes += len(line)
        self._unsynced_lines += 1
        if self._unsynced_lines >= SPOOL_FSYNC_EVERY:
            os.fsync(self._batch.fileno())
            self._unsynced_lines = 0

    def _close_batch(self) -> None:
        if self._batch is None:
            return
        self._batch.flush()
        os.fsync(self._batch.fileno())
        self._batch.close()
        self._batch = None
        self._unsynced_lines = 0

    def _copy_into_spool(self, source: Path | BinaryIO) -> tuple[str, int, str]:
        files = self.directory / ARTIFACT_FILE_DIRECTORY
        files.mkdir(mode=DIRECTORY_MODE, exist_ok=True)
        descriptor, temporary = tempfile.mkstemp(dir=files, prefix=".copy-", suffix=".partial")
        digest = hashlib.sha256()
        size = 0
        try:
            with os.fdopen(descriptor, "wb") as output:
                stream = source.open("rb") if isinstance(source, Path) else source
                try:
                    while chunk := stream.read(COPY_CHUNK_BYTES):
                        digest.update(chunk)
                        size += len(chunk)
                        output.write(chunk)
                finally:
                    if isinstance(source, Path):
                        stream.close()
                output.flush()
                os.fsync(output.fileno())
            os.chmod(temporary, FILE_MODE)
            sha256 = digest.hexdigest()
            # 内容のハッシュで置き場所を決めるので、同じファイルを2回記録しても写しは1つで済む。
            os.replace(temporary, files / sha256)
        finally:
            Path(temporary).unlink(missing_ok=True)
        return sha256, size, f"{ARTIFACT_FILE_DIRECTORY}/{sha256}"


def file_digest(path: Path) -> tuple[str, int]:
    digest = hashlib.sha256()
    size = 0
    with path.open("rb") as source:
        while chunk := source.read(COPY_CHUNK_BYTES):
            digest.update(chunk)
            size += len(chunk)
    return digest.hexdigest(), size


def is_run_directory(directory: Path) -> bool:
    return (directory / RUN_FILE).is_file()


def find_run_directories(directory: Path) -> list[Path]:
    """directory自身がrunのディレクトリならそれ、違えば名前順に並べたrunのサブディレクトリ。"""
    if is_run_directory(directory):
        return [directory]
    if not directory.is_dir():
        raise SpoolError(f"{directory} is not an offline directory")
    return sorted(child for child in directory.iterdir() if child.is_dir() and is_run_directory(child))


def load_run_record(run_directory: Path) -> SpoolRunRecord:
    return SpoolRunRecord.from_json(_read_json(run_directory / RUN_FILE))


def list_batches(run_directory: Path) -> list[SpoolBatch]:
    batch_directory = run_directory / BATCH_DIRECTORY
    if not batch_directory.is_dir():
        return []
    batches = []
    for path in batch_directory.iterdir():
        if match := BATCH_FILE_NAME.match(path.name):
            batches.append(SpoolBatch(int(match["sequence"]), match["batch_id"], path))
    return sorted(batches, key=lambda batch: batch.sequence)


def read_batch_body(batch: SpoolBatch) -> dict[str, Any]:
    """1つのバッチファイルのSyncBatchの本文。

    改行で終わらない最後の行は、書き込み中のクラッシュで切れたものなので捨てる。それ以外の読めない
    行はspoolが壊れていることを示すので、syncを止める。
    """
    metrics: list[dict[str, Any]] = []
    logs: list[dict[str, Any]] = []
    params: dict[str, Any] = {}
    tags: dict[str, str] = {}
    content = batch.path.read_text(encoding="utf-8")
    lines = content.split("\n")
    complete_lines = lines[:-1]
    for line_number, line in enumerate(complete_lines, start=1):
        try:
            record = json.loads(line)
        except ValueError:
            raise SpoolError(f"{batch.path} line {line_number} is not valid JSON") from None
        record_type = record.pop("type", None)
        if record_type == "metric":
            metrics.append(record)
        elif record_type == "log":
            logs.append(record)
        elif record_type == "params":
            params.update(record["params"])
        elif record_type == "tags":
            tags.update(record["tags"])
        else:
            raise SpoolError(f"{batch.path} line {line_number} has an unknown record type")
    body: dict[str, Any] = {"batchId": batch.batch_id, "sequence": batch.sequence}
    if metrics:
        body["metrics"] = metrics
    if logs:
        body["logs"] = logs
    if params:
        body["params"] = params
    if tags:
        body["tags"] = tags
    return body


def read_artifacts(run_directory: Path) -> list[SpoolArtifact]:
    artifacts = []
    for line_number, entry in _read_jsonl(run_directory / ARTIFACTS_FILE):
        local_path = Path(entry["localPath"])
        artifacts.append(
            SpoolArtifact(
                line_number=line_number,
                path=entry["path"],
                sha256=entry["sha256"],
                size=int(entry["size"]),
                mime_type=entry["mimeType"],
                copied=bool(entry["copied"]),
                local_path=run_directory / local_path if entry["copied"] else local_path,
            )
        )
    return artifacts


def read_media(run_directory: Path) -> list[dict[str, Any]]:
    return [entry for _line_number, entry in _read_jsonl(run_directory / MEDIA_FILE)]


def read_status(run_directory: Path) -> SpoolStatus | None:
    path = run_directory / STATUS_FILE
    if not path.exists():
        return None
    content = _read_json(path)
    if not isinstance(content, dict):
        raise SpoolError(f"{path} has an unsupported format")
    return SpoolStatus(
        batch_id=str(content["batchId"]),
        status=str(content["status"]),
        ended_at=str(content["endedAt"]),
        error=content.get("error"),
    )


def _read_jsonl(path: Path) -> Iterator[tuple[int, dict[str, Any]]]:
    if not path.exists():
        return
    lines = path.read_text(encoding="utf-8").split("\n")
    for line_number, line in enumerate(lines[:-1], start=1):
        try:
            entry = json.loads(line)
        except ValueError:
            raise SpoolError(f"{path} line {line_number} is not valid JSON") from None
        yield line_number, entry


@contextmanager
def sync_lock(run_directory: Path) -> Iterator[bool]:
    """writerがまだRunを記録している間はFalseをyieldする。そのときsyncはそのRunを飛ばす。"""
    descriptor = os.open(run_directory / WRITER_LOCK_FILE, os.O_RDWR | os.O_CREAT, FILE_MODE)
    try:
        try:
            fcntl.flock(descriptor, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except OSError:
            yield False
            return
        yield True
    finally:
        os.close(descriptor)


def remove_run_directory(run_directory: Path) -> None:
    shutil.rmtree(run_directory)
