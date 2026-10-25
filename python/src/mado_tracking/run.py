"""Runのライフサイクルと記録。Jobが持つRunの状態を完了にするのは、workerだけ。"""

from __future__ import annotations

import math
import mimetypes
import os
import sys
from collections.abc import Mapping
from pathlib import Path
from types import TracebackType
from typing import TYPE_CHECKING, Any, BinaryIO, Literal
from uuid import uuid4

from .checkpoints import ResumeCheckpoint, log_checkpoint, resume_checkpoint_from_environment
from .client import path_id
from .errors import ConfigurationError
from .media import (
    TABLE_MIME_TYPE,
    Audio,
    Image,
    MediaFile,
    MediaKind,
    MediaValue,
    Table,
    Video,
    media_artifact_path,
    validate_media_key,
    validate_step,
)
from .offline.transport import ARTIFACT_CHUNK_BYTES, HttpRunTransport, RunMediaItem, RunTransport
from .preprocessing_reports import log_preprocessing_report
from .security import SecretMasker, secret_values
from .system_metrics import DEFAULT_SYSTEM_METRICS_SECONDS, SystemMetricsMonitor
from .timestamps import utc_timestamp
from .training_data_stages import log_training_data_stage, training_data_stages

if TYPE_CHECKING:
    from .client import Client

__all__ = ["ARTIFACT_CHUNK_BYTES", "Run"]


class Run:
    """Runの記録用API。書き込みはRunTransportへ行く（API、オフラインのspool、または両方を順に）。

    ``last_steps``はRunを再開したときに渡される。そのとき、stepを指定しないlog_metricsは
    step 0に書かず、メトリクスのキーごとに最大のstepの次から続ける。
    """

    log_preprocessing_report = log_preprocessing_report
    log_training_data_stage = log_training_data_stage
    training_data_stages = training_data_stages

    def __init__(
        self,
        client: Client | None,
        project_id: str,
        entity: dict[str, Any],
        *,
        managed_by_worker: bool = False,
        transport: RunTransport | None = None,
        last_steps: Mapping[str, int] | None = None,
        masker: SecretMasker | None = None,
    ):
        self._client = client
        self.project_id = project_id
        self.entity = entity
        self.id: str = entity["id"]
        self.managed_by_worker = managed_by_worker
        self.close_client_on_exit = False
        if transport is None:
            if client is None:
                raise ConfigurationError("A Run without a client needs a transport")
            transport = HttpRunTransport(client, project_id, self.id)
        self.transport = transport
        if masker is None:
            masker = client.masker if client is not None else SecretMasker(secret_values(os.environ))
        self.masker = masker
        self._continues_steps = last_steps is not None
        self._last_steps: dict[str, int] = dict(last_steps or {})
        self._system_metrics: SystemMetricsMonitor | None = None

    @property
    def client(self) -> Client:
        """APIのclient。オフラインのRunはclientを持たず、ローカルに記録するだけ。"""
        if self._client is None:
            raise ConfigurationError("This operation needs the API; an offline Run only records locally")
        return self._client

    @property
    def api_path(self) -> str:
        return self.client.project_path(self.project_id, f"runs/{path_id(self.id)}")

    @property
    def offline_directory(self) -> Path | None:
        """このRunをローカルに記録している場所。APIに書いている間はNone。"""
        return self.transport.offline_directory

    def last_step(self, key: str) -> int | None:
        """keyで記録した最大のstep。Runを再開する前に記録したstepも含む。"""
        return self._last_steps.get(key)

    def start_system_metrics(self, *, interval_seconds: float | None = None) -> None:
        """GPU/CPU/メモリ/ディスク/ネットワークのメトリクス（`system.*`）を、finishまで
        間隔ごとに記録する。"""
        if self._system_metrics is not None:
            return
        monitor = SystemMetricsMonitor(
            self.transport.log_metrics,
            interval_seconds=interval_seconds or DEFAULT_SYSTEM_METRICS_SECONDS,
            pid=os.getpid(),
        )
        monitor.start()
        self._system_metrics = monitor

    def stop_system_metrics(self) -> None:
        monitor, self._system_metrics = self._system_metrics, None
        if monitor is not None:
            monitor.stop()

    def __enter__(self) -> Run:
        self.start()
        return self

    def __exit__(
        self,
        exception_type: type[BaseException] | None,
        exception: BaseException | None,
        traceback: TracebackType | None,
    ) -> Literal[False]:
        try:
            self.stop_system_metrics()
            if self.managed_by_worker:
                return False
            if exception is None:
                self.finish()
                return False
            try:
                # ログを先に送る。finishがtransportを閉じるうえ、オフラインのspoolは終了状態の前に
                # ログを送るため。
                self.log(str(exception), level="error")
                self.finish(status="failed")
            except Exception as reporting_error:
                exception.add_note(f"Failed to report Run failure: {self.masker.mask(str(reporting_error))}")
            return False
        finally:
            if self.close_client_on_exit and self._client is not None:
                self._client.close()

    def start(self) -> None:
        if self.managed_by_worker or self.entity.get("status") == "running":
            return
        if self.entity.get("status") in {"finished", "failed", "canceled"}:
            raise ConfigurationError("A terminal Run cannot be started again; create a new Run")
        self._apply_entity(self.transport.start(), {"status": "running"})

    def finish(self, *, status: str = "finished") -> None:
        if self.managed_by_worker:
            raise ConfigurationError("A job-owned Run is completed by the worker")
        if status not in {"finished", "failed", "canceled"}:
            raise ConfigurationError("Run completion requires a terminal status")
        # 終了状態のあとに、システムメトリクスのサンプルが届かないようにする。
        self.stop_system_metrics()
        try:
            self._apply_entity(self.transport.finish(status), {"status": status})
        finally:
            self.transport.close()
        if self.offline_directory is not None:
            print(
                f"mado-tracking: Run {self.id} was recorded in {self.offline_directory}. "
                f"Send it with `mado-tracking sync {self.offline_directory}`.",
                file=sys.stderr,
            )

    def log_params(self, parameters: Mapping[str, Any]) -> None:
        self._apply_entity(
            self.transport.log_params(parameters),
            {"parameters": {**self.entity.get("parameters", {}), **parameters}},
        )

    def set_tags(self, tags: Mapping[str, str]) -> None:
        self._apply_entity(self.transport.set_tags(tags), {"tags": {**self.entity.get("tags", {}), **tags}})

    def log_metrics(
        self, metrics: Mapping[str, float], *, step: int | None = None, timestamp: str | None = None
    ) -> None:
        """stepにメトリクスを記録する。stepを指定しなければ、新しいRunは0を使い、再開したRunは
        曲線が続くよう、キーごとに最後のstep + 1を使う。"""
        if not metrics:
            return
        if step is not None and step < 0:
            raise ConfigurationError("Metric step must be non-negative")
        if any(not math.isfinite(value) for value in metrics.values()):
            raise ConfigurationError("Metrics must have finite values")
        logged_at = timestamp or utc_timestamp()
        steps = {name: self._metric_step(name, step) for name in metrics}
        self.transport.log_metrics(
            [
                {"name": name, "value": value, "step": steps[name], "timestamp": logged_at}
                for name, value in metrics.items()
            ]
        )
        for name, logged_step in steps.items():
            self._last_steps[name] = max(logged_step, self._last_steps.get(name, -1))

    def log(self, message: str, *, level: str = "info", timestamp: str | None = None) -> None:
        if level not in {"info", "warning", "error"}:
            raise ConfigurationError("Unsupported log level")
        self.transport.log_entries(
            [
                {
                    "timestamp": timestamp or utc_timestamp(),
                    "level": level,
                    "message": self.masker.mask(message),
                }
            ]
        )

    def log_artifact(
        self,
        source: str | Path | BinaryIO,
        *,
        path: str | None = None,
        mime_type: str | None = None,
        copy: bool = True,
    ) -> dict[str, Any]:
        """オンラインでは、SESSION_UPLOAD_THRESHOLD_BYTES以上のファイルを、再開できる
        アップロードセッションで送る。

        オフラインでは、ファイルをspoolに写す。copy=Falseならパスとsha256だけを持ち、その間に
        ファイルが変わっていたら、syncはそのファイルを拒む。
        """
        source = Path(source) if isinstance(source, str) else source
        if isinstance(source, Path):
            path = path or source.name
        if not path:
            raise ConfigurationError("path is required for a binary stream")
        content_type = mime_type or mimetypes.guess_type(path)[0] or "application/octet-stream"
        return self.transport.log_artifact(source, path=path, mime_type=content_type, copy=copy)

    @property
    def current_step(self) -> int:
        """stepを指定せずにメディアを記録するときのstep。これまでに記録したメトリクスの最大のstep
        （再開後はその続き）、無ければ0。W&Bと同じ。"""
        return max(self._last_steps.values(), default=0)

    def log_audio(
        self,
        key: str,
        data: Any,
        *,
        step: int | None = None,
        sample_rate: int | None = None,
        caption: str | None = None,
    ) -> dict[str, Any]:
        """stepに音声を記録する。パス、bytes、Audio、またはsample_rateつきのnumpy配列（WAVで保存）。

        オンラインでは登録したRunMediaを、オフラインではspoolに書いたメディアのレコードを返す。
        """
        audio = data if isinstance(data, Audio) else Audio(data, sample_rate=sample_rate)
        return self._log_media_value(key, audio, step=step, caption=caption)

    def log_image(
        self, key: str, image: Any, *, step: int | None = None, caption: str | None = None
    ) -> dict[str, Any]:
        """stepに画像を記録する。パス、bytes、Image、PIL.Image、またはnumpy配列（PNGで保存）。"""
        value = image if isinstance(image, Image) else Image(image)
        return self._log_media_value(key, value, step=step, caption=caption)

    def log_video(
        self, key: str, video: Any, *, step: int | None = None, caption: str | None = None
    ) -> dict[str, Any]:
        """エンコード済みの動画ファイル（パス、bytes、Video）をstepに記録する。そのまま保存する。"""
        value = video if isinstance(video, Video) else Video(video)
        return self._log_media_value(key, value, step=step, caption=caption)

    def log_table(self, key: str, table: Any, *, step: int | None = None) -> dict[str, Any]:
        """Table、{columns, data}、pandas.DataFrameを、MLflowのsplit形式のJSONとしてstepに記録する。

        Audio/Image/Videoのセルは、先に表の隣にArtifactとして保存し、{type, filepath}のセルとして
        書く。MLflowが画像のセルに使う形。
        """
        validate_media_key(key)
        media_step = self._media_step(step)
        value = Table.from_value(table)
        stored_cells: dict[tuple[int, int], dict[str, str]] = {}
        for row, column, cell in value.media_cells():
            cell_path = media_artifact_path(key, media_step, cell.file.extension)
            with cell.file.local_path() as source:
                self.transport.log_artifact(source, path=cell_path, mime_type=cell.file.mime_type, copy=True)
            stored_cells[(row, column)] = {"type": cell.kind, "filepath": cell_path}
        table_file = MediaFile(
            TABLE_MIME_TYPE,
            "json",
            {"rowCount": len(value.rows), "columnCount": len(value.columns)},
            content=value.split_json(stored_cells),
        )
        return self._log_media_file(key, "table", table_file, step=media_step, caption=None)

    def _log_media_value(
        self, key: str, value: MediaValue, *, step: int | None, caption: str | None
    ) -> dict[str, Any]:
        return self._log_media_file(
            key, value.kind, value.file, step=self._media_step(step), caption=caption or value.caption
        )

    def _log_media_file(
        self, key: str, kind: MediaKind, file: MediaFile, *, step: int, caption: str | None
    ) -> dict[str, Any]:
        media = RunMediaItem(
            id=str(uuid4()),
            key=key,
            step=step,
            kind=kind,
            artifact_path=media_artifact_path(key, step, file.extension),
            mime_type=file.mime_type,
            caption=caption,
            metadata=file.metadata,
        )
        with file.local_path() as source:
            return self.transport.log_media(source, media)

    def _media_step(self, step: int | None) -> int:
        return self.current_step if step is None else validate_step(step)

    def _metric_step(self, name: str, step: int | None) -> int:
        if step is not None:
            return step
        if not self._continues_steps:
            return 0
        last = self._last_steps.get(name)
        return 0 if last is None else last + 1

    def _apply_entity(self, entity: dict[str, Any] | None, local_change: Mapping[str, Any]) -> None:
        """APIのエンティティがあればそれを使う。オフラインでは代わりに変更をローカルに適用する。"""
        self.entity = entity if entity is not None else {**self.entity, **local_change}

    def log_artifacts(self, directory: str | Path, *, path: str | None = None) -> list[dict[str, Any]]:
        """directory以下のすべてのファイルを記録する。相対パスは保ち、任意のpathを前に付ける。"""
        root = Path(directory)
        if not root.is_dir():
            raise ConfigurationError("log_artifacts requires a directory")
        prefix = path.strip("/") + "/" if path and path.strip("/") else ""
        # rglobはシンボリックリンクのディレクトリには入らないので、たどる範囲は木の中に留まる。
        files = sorted(file for file in root.rglob("*") if file.is_file())
        return [self.log_artifact(file, path=prefix + file.relative_to(root).as_posix()) for file in files]

    def log_checkpoint(
        self,
        directory: str | Path,
        *,
        step: int,
        includes_optimizer: bool = False,
        framework: str | None = None,
        metadata: Mapping[str, Any] | None = None,
    ) -> dict[str, Any]:
        """directoryを、このRunのstepのcheckpointとして保存する。あとのRunはそこから続けられる。"""
        return log_checkpoint(
            self,
            directory,
            step=step,
            includes_optimizer=includes_optimizer,
            framework=framework,
            metadata=metadata,
        )

    def resume_checkpoint(self) -> ResumeCheckpoint | None:
        """このJobが続きから始めるcheckpoint（pathとstep）。最初から始めるならNone。

        曲線がcheckpointを保存したところから続くよう、メトリクスはstep + 1以降に記録する。
        """
        return resume_checkpoint_from_environment()

    def download_input_model(
        self, destination: str | Path, *, model_version: Mapping[str, Any] | None = None
    ) -> Path:
        from .model_input import download_input_model, pinned_model_version

        pinned_version = pinned_model_version(
            project_id=self.project_id,
            model_version_id=self.entity.get("modelVersionId"),
            model_version=model_version,
        )
        return download_input_model(
            self.client, Path(destination), project_id=self.project_id, model_version=pinned_version
        )

    def register_output_model(self, *, version: str | None = None, **attributes: Any) -> dict[str, Any]:
        """このRunの出力を登録する。model_name=を渡すと、複数のRunで1つのモデルを使い回せる。"""
        if self.entity.get("kind") not in {"training", "finetuning"}:
            raise ConfigurationError("Output models require a training or finetuning Run")
        attributes.setdefault(
            "parent_model_version_ids",
            [self.entity["modelVersionId"]] if self.entity.get("modelVersionId") else [],
        )
        return self.client.register_model(
            self.project_id, version=version, source_run_id=self.id, **attributes
        )

    def register_output_dataset(
        self, *, version: str, uri: str, digest: str, **attributes: Any
    ) -> dict[str, Any]:
        attributes.setdefault("parent_dataset_version_ids", self.entity.get("inputDatasetVersionIds", []))
        return self.client.register_dataset(
            self.project_id, version=version, uri=uri, digest=digest, source_run_id=self.id, **attributes
        )
