"""検証済みのローカルのSIFを、取り消せる所有のプロセスグループと、選んだCUDAのGPUで実行する。"""

from __future__ import annotations

from pathlib import Path
from typing import Any

from .container_layout import ContainerMount, container_environment, host_runtime
from .host_execution import CommandExecution
from .host_state import write_json
from .runtime_capability import RuntimeUnavailable, runtime_binary

# 入力の隔離と、環境変数・argvを文字どおりに扱うために、これらのフラグが要る。
REQUIRED_SIF_FLAGS = {"--cleanenv", "--containall", "--no-eval", "--no-home", "--no-mount", "--pwd"}


def execute_sif(
    workspace: Path,
    specification: dict[str, Any],
    *,
    mounts: list[ContainerMount],
    execution: CommandExecution,
) -> int:
    runtime = host_runtime(specification)
    kind = runtime["kind"]
    binary = runtime_binary(kind)
    if execution.run([binary, "--version"])[0]:
        raise RuntimeUnavailable(kind, "CLI version probe failed")
    help_exit_code, supported_flags = execution.run([binary, "exec", "--help"], capture=True)
    required_flags = REQUIRED_SIF_FLAGS | ({"--nv"} if specification["gpuIds"] else set())
    if help_exit_code or not all(flag in supported_flags for flag in required_flags):
        raise RuntimeUnavailable(
            kind, "CLI lacks required exec flags for isolation and GPU/environment handling"
        )
    execution.state["runtimeCapability"] = {"kind": kind, "available": True}
    write_json(workspace / "state.json", execution.state)
    # 接頭辞つきの変数で渡すと、秘密情報がシェルやenvファイルで展開されず、argvにも値が載らない。
    prefix = "APPTAINERENV_" if kind == "apptainer" else "SINGULARITYENV_"
    for name, value in container_environment(specification).items():
        execution.environment[prefix + name] = value
    execution.environment["CUDA_VISIBLE_DEVICES"] = ",".join(specification["gpuIds"])
    argv = [
        binary,
        "exec",
        "--cleanenv",
        "--containall",
        "--no-eval",
        "--no-home",
        "--no-mount",
        "hostfs,cwd,bind-paths",
    ]
    for mount in mounts:
        if any(character in str(mount.host_path) for character in ":,\r\n"):
            raise ValueError("SIF bind source paths cannot contain colon, comma, or newlines")
        argv.extend(
            ["--bind", f"{mount.host_path}:{mount.container_path}:{'ro' if mount.readonly else 'rw'}"]
        )
    if specification["gpuIds"]:
        argv.append("--nv")
    directory = runtime.get("workingDirectory")
    if directory is None and specification["codeVersion"]["source"] is not None:
        directory = "/mmt/source"
    if directory is not None:
        argv.extend(["--pwd", directory])
    # execはイメージのrunscriptを通らず、登録したentrypointのargvをそのまま使う。
    argv.extend([str(workspace / "runtime.sif"), *specification["executionSnapshot"]["entrypoint"]])
    exit_code, _captured = execution.run(argv)
    return exit_code
