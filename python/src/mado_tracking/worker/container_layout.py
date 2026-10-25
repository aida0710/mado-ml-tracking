"""コンテナの入力、context、任意のsource、出力のマウントだけを用意する。

再開用と入力のcheckpointも置く（どのruntimeでもinputsの下）。配置した入力のデータセット
（MMT_INPUT_DATASET_DIRS）も、どのruntimeにも見せる。
"""

from __future__ import annotations

import json
import os
import shutil
import stat
import tempfile
from dataclasses import dataclass
from pathlib import Path
from typing import Any
from urllib.parse import unquote, urlsplit

from ..checkpoint_archive import extract_checkpoint_archive
from .container_outputs import HASH_CHUNK_BYTES, file_checksum
from .dataset_cache import DatasetCache
from .host_state import write_json
from .workflow_context import DATASET_USAGE_FILENAME, dataset_usage_document, workflow_context_environment

INPUTS_PATH = "/mmt/inputs"
CONTEXT_PATH = "/mmt/context"
OUTPUTS_PATH = "/mmt/outputs"
SOURCE_PATH = "/mmt/source"
WEIGHTS_FILENAME = "weights"
UPSTREAM_RUN_FILENAME = "upstream-run.json"
# checkpointはinputs/checkpointに展開する（コンテナの中では読み取り専用の/mmt/inputs/checkpoint）。
RESUME_CHECKPOINT_DIRECTORY = "checkpoint"
RESUME_CHECKPOINT_FILENAME = "resume-checkpoint.json"
RESUME_CHECKPOINT_ARCHIVE = "checkpoint.tar"
# 入力としてコードに渡すcheckpoint（checkpoint_savedのフック）も同じ場所
# （/mmt/inputs/checkpoint）に置く。再開もするJobでは、その場所を再開用のcheckpointに使い、
# 入力のcheckpointはinputs/input-checkpointから読む。MMT_INPUT_CHECKPOINT_DIRはどちらの場合も
# その場所を指す。
INPUT_CHECKPOINT_FALLBACK_DIRECTORY = "input-checkpoint"
INPUT_CHECKPOINT_FILENAME = "input-checkpoint.json"
INPUT_CHECKPOINT_ARCHIVE = "input-checkpoint.tar"
# Jobを起動した手動起動のペイロード、またはWebhookの本文（フック）。
TRIGGER_PAYLOAD_FILENAME = "trigger-payload.json"
# 配置した各入力ファイルの、Jobのworkspaceでの場所。`upload-<kind>`がそこに書く。
STAGED_INPUT_PATHS = {
    "source": "source.archive",
    "sif": "runtime.sif",
    "weights": "inputs/weights",
    "checkpoint": RESUME_CHECKPOINT_ARCHIVE,
    "input-checkpoint": INPUT_CHECKPOINT_ARCHIVE,
}
# コンテナには、データセットごとに別の読み取り専用のbindで渡す。読み取り専用の/mmt/inputsの
# bindの下に入れ子にはしない。そのホスト側のディレクトリにはマウントポイントを作れないため。
INPUT_DATASETS_PATH = "/mmt/datasets"
# ホストのpythonは<workspace>/inputs/datasets/<versionId>を読む。これはデータセットの
# キャッシュへのシンボリックリンク。
INPUT_DATASETS_DIRECTORY = "datasets"


@dataclass(frozen=True)
class ContainerMount:
    host_path: Path
    container_path: str
    readonly: bool


def host_runtime(specification: dict[str, Any]) -> dict[str, Any]:
    """このホストが実行するruntime。登録したruntimeか、siteがそれを変換したSIF。

    どちらの場合もexecutionSnapshotには登録したruntimeを残す。そのためRunには登録した内容が
    記録され、ホストではそれに相当するローカルのもの（DockerイメージをpullしたSIF）を動かす。
    """
    converted = specification.get("hostRuntime")
    if converted is not None:
        return dict(converted)
    return dict(specification["codeVersion"]["runtime"])


def host_environment() -> dict[str, str]:
    # コンテナ用の変数で、CLIのバイナリ、デーモン、ホストの認証情報を選べてはいけない。
    allowed_names = {"PATH", "HOME", "LANG", "LC_ALL", "LD_LIBRARY_PATH", "TMPDIR"}
    return {name: value for name, value in os.environ.items() if name in allowed_names}


def upstream_run_document(run: dict[str, Any], model_version: dict[str, Any] | None) -> dict[str, Any] | None:
    """このJobが出力を使うRunを説明する。上流が無ければNone。

    親のRunが上流になる。保留していた自動実行は学習のRunを、自動実行の連鎖は上流の推論のRunを
    親としてつなぐ。WorkerJobはそのRunのスナップショットを持たないので、このRunから見える事実だけを
    含め、残り（Runの種類など）は推測せずに省く。
    """
    parent_run_id = run.get("parentRunId")
    if not parent_run_id:
        return None
    if not isinstance(parent_run_id, str):
        raise ValueError("WorkerJob run.parentRunId must be a string")
    document: dict[str, Any] = {"runId": parent_run_id}
    # 上流の出力のうち、このRunが入力に取るものだけ。親はほかにも出力を作っているかもしれない。
    upstream_dataset_ids = run.get("upstreamDatasetVersionIds") or []
    if upstream_dataset_ids:
        document["outputDatasetVersionIds"] = list(upstream_dataset_ids)
    if model_version is not None and model_version.get("sourceRunId") == parent_run_id:
        document["outputModelVersionIds"] = [model_version["id"]]
    return document


def upstream_environment(context: dict[str, Any], upstream_run_file: str) -> dict[str, str]:
    # 上流の無いJobには変数を渡さない。コードは変数の有無で判断できる。
    upstream_run = context.get("upstreamRun")
    if upstream_run is None:
        return {}
    return {"MMT_UPSTREAM_RUN_ID": upstream_run["runId"], "MMT_UPSTREAM_RUN_FILE": upstream_run_file}


def resume_checkpoint_document(checkpoint: dict[str, Any] | None) -> dict[str, Any] | None:
    """Jobのコードがcheckpointについて読む内容（MMT_RESUME_CHECKPOINT_FILE）。"""
    if checkpoint is None:
        return None
    manifest = checkpoint["manifest"]
    return {
        "checkpointId": checkpoint["id"],
        "sourceRunId": checkpoint["runId"],
        "step": checkpoint["step"],
        "source": checkpoint["source"],
        "files": manifest["files"],
        "includesOptimizer": bool(manifest.get("includesOptimizer", False)),
        "framework": manifest.get("framework"),
        "metadata": checkpoint.get("metadata", {}),
    }


def resume_checkpoint_environment(
    context: dict[str, Any], *, checkpoint_directory: str, document_file: str
) -> dict[str, str]:
    # 最初から始めるJobには変数を渡さない。コードは変数の有無で判断できる。
    document = context.get("resumeCheckpoint")
    if document is None:
        return {}
    return {
        "MMT_RESUME_CHECKPOINT_DIR": checkpoint_directory,
        "MMT_RESUME_STEP": str(document["step"]),
        "MMT_RESUME_CHECKPOINT_FILE": document_file,
    }


def input_checkpoint_directory(context: dict[str, Any]) -> str:
    """inputsの下で入力のcheckpointを置くディレクトリ。

    INPUT_CHECKPOINT_FALLBACK_DIRECTORYを参照。
    """
    if context.get("resumeCheckpoint") is not None:
        return INPUT_CHECKPOINT_FALLBACK_DIRECTORY
    return RESUME_CHECKPOINT_DIRECTORY


def input_checkpoint_environment(
    context: dict[str, Any], *, inputs_directory: str, document_file: str
) -> dict[str, str]:
    # 入力のcheckpointが無いJobには変数を渡さない。コードは変数の有無で判断できる。
    if context.get("inputCheckpoint") is None:
        return {}
    return {
        "MMT_INPUT_CHECKPOINT_DIR": f"{inputs_directory}/{input_checkpoint_directory(context)}",
        "MMT_INPUT_CHECKPOINT_FILE": document_file,
    }


def trigger_payload_environment(context: dict[str, Any], *, document_file: str) -> dict[str, str]:
    if context.get("triggerPayload") is None:
        return {}
    return {"MMT_TRIGGER_PAYLOAD_FILE": document_file}


def staged_dataset_paths(workspace: Path, specification: dict[str, Any]) -> dict[str, Path]:
    """配置した入力のデータセットの、コンピュータ上のパス。起動の直前にもう一度確かめる。"""
    staged = specification["stagedInputs"]["datasets"]
    # 記述だけのバージョン（urn:、mmt-artifact:）は配置するものが無いので除く。
    if not set(staged) <= {dataset["id"] for dataset in specification["context"]["inputDatasets"]}:
        raise ValueError("Staged datasets are not the Job's inputs")
    cache = DatasetCache.for_workspace(workspace)
    paths = {}
    for version_id, entry in staged.items():
        path = Path(entry["path"])
        key = entry.get("key")
        if key is not None and (path != cache.data_path(key) or not cache.is_complete(key)):
            raise ValueError(f"Input dataset cache entry is incomplete: {version_id}")
        if not path.exists():
            raise ValueError(f"Input dataset path is missing on the target: {version_id}")
        paths[version_id] = path
    return paths


def link_input_datasets(workspace: Path, paths: dict[str, Path]) -> dict[str, str]:
    """ホストのpython用に、各データセットへのシンボリックリンクをinputs/datasetsの下に作る。

    戻り値はMMT_INPUT_DATASET_DIRS。
    """
    directory = workspace / "inputs" / INPUT_DATASETS_DIRECTORY
    if directory.parent.is_symlink() or directory.is_symlink():
        raise ValueError("Input dataset directory must not be a symlink")
    directory.mkdir(mode=0o700, parents=True, exist_ok=True)
    links = {}
    for version_id, path in paths.items():
        link = directory / version_id
        link.unlink(missing_ok=True)
        link.symlink_to(path, target_is_directory=path.is_dir())
        links[version_id] = str(link)
    return links


def install_resume_checkpoint(workspace: Path, specification: dict[str, Any]) -> None:
    """配置したcheckpointのtarをコンピュータ上で確かめ直し、読み取り専用で展開する。"""
    _install_checkpoint(
        workspace,
        specification,
        document_key="resumeCheckpoint",
        staged_key="checkpoint",
        archive_name=RESUME_CHECKPOINT_ARCHIVE,
        directory_name=RESUME_CHECKPOINT_DIRECTORY,
        label="Resume checkpoint",
    )


def install_input_checkpoint(workspace: Path, specification: dict[str, Any]) -> None:
    """配置した入力のcheckpointを同じように展開する。再開用のcheckpointがあればその隣に置く。"""
    _install_checkpoint(
        workspace,
        specification,
        document_key="inputCheckpoint",
        staged_key="inputCheckpoint",
        archive_name=INPUT_CHECKPOINT_ARCHIVE,
        directory_name=input_checkpoint_directory(specification["context"]),
        label="Input checkpoint",
    )


def _install_checkpoint(
    workspace: Path,
    specification: dict[str, Any],
    *,
    document_key: str,
    staged_key: str,
    archive_name: str,
    directory_name: str,
    label: str,
) -> None:
    document = specification["context"].get(document_key)
    if document is None:
        return
    archive = workspace / archive_name
    expected = specification.get("stagedInputs", {}).get(staged_key)
    if expected is None or not archive.exists():
        raise ValueError(f"{label} was not staged")
    verify_staged_file(archive, expected)
    inputs = workspace / "inputs"
    if inputs.is_symlink():
        raise ValueError("Container mount directory must not be a symlink")
    inputs.mkdir(mode=0o700, exist_ok=True)
    extract_checkpoint_archive(archive, inputs / directory_name, document["files"])
    archive.unlink()


def prepare_container_layout(workspace: Path, specification: dict[str, Any]) -> list[ContainerMount]:
    mounts = []
    for name, container_path, readonly in (
        ("inputs", INPUTS_PATH, True),
        ("context", CONTEXT_PATH, True),
        ("outputs", OUTPUTS_PATH, False),
    ):
        directory = workspace / name
        if directory.is_symlink():
            raise ValueError("Container mount directory must not be a symlink")
        directory.mkdir(mode=0o700, exist_ok=True)
        mounts.append(ContainerMount(directory, container_path, readonly))
    context = specification["context"]
    context_files = {
        "context.json": context,
        "parameters.json": context["parameters"],
        "model-version.json": {"modelVersion": context["modelVersion"]},
        "dataset-versions.json": {"inputDatasets": context["inputDatasets"]},
    }
    dataset_usage = dataset_usage_document(context)
    if dataset_usage is not None:
        context_files[DATASET_USAGE_FILENAME] = dataset_usage
    if context.get("upstreamRun") is not None:
        context_files[UPSTREAM_RUN_FILENAME] = context["upstreamRun"]
    if context.get("resumeCheckpoint") is not None:
        context_files[RESUME_CHECKPOINT_FILENAME] = context["resumeCheckpoint"]
    if context.get("inputCheckpoint") is not None:
        context_files[INPUT_CHECKPOINT_FILENAME] = context["inputCheckpoint"]
    if context.get("triggerPayload") is not None:
        context_files[TRIGGER_PAYLOAD_FILENAME] = context["triggerPayload"]
    for name, document in context_files.items():
        write_json(workspace / "context" / name, document)
    if specification["codeVersion"]["source"] is not None:
        mounts.append(ContainerMount(workspace / "source", SOURCE_PATH, True))
    for version_id, path in staged_dataset_paths(workspace, specification).items():
        mounts.append(ContainerMount(path, f"{INPUT_DATASETS_PATH}/{version_id}", True))
    return mounts


def stage_local_weights(workspace: Path, model_version: dict[str, Any]) -> None:
    uri = urlsplit(model_version.get("weightsUri") or "")
    if uri.scheme != "file" or uri.netloc not in {"", "localhost"} or uri.query or uri.fragment:
        raise ValueError("Input weights require a staged Artifact, HTTP(S) download, or local file:// URI")
    source_path = Path(unquote(uri.path))
    if not source_path.is_absolute() or source_path.is_symlink():
        raise ValueError("Local input weights must be an absolute regular file")
    descriptor = os.open(source_path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    destination = workspace / "inputs" / WEIGHTS_FILENAME
    with os.fdopen(descriptor, "rb") as source:
        if not stat.S_ISREG(os.fstat(source.fileno()).st_mode):
            raise ValueError("Local input weights must be a regular file")
        temporary_descriptor, temporary = tempfile.mkstemp(dir=destination.parent)
        try:
            with os.fdopen(temporary_descriptor, "wb") as output:
                shutil.copyfileobj(source, output, length=HASH_CHUNK_BYTES)
                output.flush()
                os.fsync(output.fileno())
            os.replace(temporary, destination)
        finally:
            Path(temporary).unlink(missing_ok=True)


def verify_container_inputs(workspace: Path, specification: dict[str, Any]) -> None:
    model_version = specification["context"]["modelVersion"]
    if model_version is not None:
        weights = workspace / "inputs" / WEIGHTS_FILENAME
        expected = specification.get("stagedInputs", {}).get("weights")
        if not weights.exists() and not model_version.get("artifactId") and expected is None:
            stage_local_weights(workspace, model_version)
        verify_staged_file(weights, expected)
        weights.chmod(0o400)
    runtime = host_runtime(specification)
    if runtime["kind"] in {"singularity", "apptainer"}:
        verify_staged_file(workspace / "runtime.sif", {"sha256": runtime["sha256"]})
        (workspace / "runtime.sif").chmod(0o400)


def verify_staged_file(path: Path, expected: dict[str, Any] | None) -> None:
    if path.is_symlink():
        raise ValueError("Staged inputs must not be symlinks")
    with path.open("rb") as content:
        if not stat.S_ISREG(os.fstat(content.fileno()).st_mode):
            raise ValueError("Staged inputs must be regular files")
        checksum, size = file_checksum(content)
    if expected is not None and (
        checksum != expected["sha256"] or "size" in expected and size != expected["size"]
    ):
        raise ValueError("Staged input sha256 or size mismatch")


def container_environment(specification: dict[str, Any]) -> dict[str, str]:
    context = specification["context"]
    environment = dict(specification["codeVersion"]["environment"])
    environment.update(specification["sdkEnvironment"])
    environment.update(
        MMT_JOB_KIND=context["kind"],
        MMT_EXECUTION_MODE=specification["executionSnapshot"]["mode"],
        MMT_JOB_CONTEXT_FILE=f"{CONTEXT_PATH}/context.json",
        MMT_PARAMETERS_FILE=f"{CONTEXT_PATH}/parameters.json",
        MMT_MODEL_VERSION_FILE=f"{CONTEXT_PATH}/model-version.json",
        MMT_DATASET_VERSIONS_FILE=f"{CONTEXT_PATH}/dataset-versions.json",
        MMT_PARAMETERS_JSON=json.dumps(context["parameters"]),
        MMT_MODEL_VERSION_ID=str((context["modelVersion"] or {}).get("id", "")),
        MMT_INPUT_DATASET_VERSION_IDS=json.dumps([dataset["id"] for dataset in context["inputDatasets"]]),
        MMT_INPUTS_DIR=INPUTS_PATH,
        MMT_OUTPUTS_DIR=OUTPUTS_PATH,
        MMT_RESULT_FILE=f"{OUTPUTS_PATH}/result.json",
        MMT_SOURCE_DIR=SOURCE_PATH if specification["codeVersion"]["source"] is not None else "",
        MMT_MODEL_FILE=f"{INPUTS_PATH}/{WEIGHTS_FILENAME}" if context["modelVersion"] is not None else "",
        PYTHONUNBUFFERED="1",
    )
    environment.update(upstream_environment(context, f"{CONTEXT_PATH}/{UPSTREAM_RUN_FILENAME}"))
    environment.update(
        workflow_context_environment(context, dataset_usage_file=f"{CONTEXT_PATH}/{DATASET_USAGE_FILENAME}")
    )
    staged_datasets = specification["stagedInputs"]["datasets"]
    environment["MMT_INPUT_DATASET_DIRS"] = json.dumps(
        {version_id: f"{INPUT_DATASETS_PATH}/{version_id}" for version_id in staged_datasets}
    )
    environment.update(
        resume_checkpoint_environment(
            context,
            checkpoint_directory=f"{INPUTS_PATH}/{RESUME_CHECKPOINT_DIRECTORY}",
            document_file=f"{CONTEXT_PATH}/{RESUME_CHECKPOINT_FILENAME}",
        )
    )
    environment.update(
        input_checkpoint_environment(
            context, inputs_directory=INPUTS_PATH, document_file=f"{CONTEXT_PATH}/{INPUT_CHECKPOINT_FILENAME}"
        )
    )
    environment.update(
        trigger_payload_environment(context, document_file=f"{CONTEXT_PATH}/{TRIGGER_PAYLOAD_FILENAME}")
    )
    # Dockerで選んだGPUのUUID・indexは、コンテナの中でのCUDAの番号に振り直す。
    gpu_ids = specification["gpuIds"]
    runtime_kind = host_runtime(specification).get("kind")
    environment["CUDA_VISIBLE_DEVICES"] = (
        ",".join(str(index) for index in range(len(gpu_ids)))
        if runtime_kind == "docker"
        else ",".join(gpu_ids)
    )
    environment["NVIDIA_VISIBLE_DEVICES"] = ",".join(gpu_ids) if gpu_ids else "void"
    environment["NVIDIA_DRIVER_CAPABILITIES"] = "compute,utility"
    return environment
