"""ApptainerかSingularityしか無いsiteで、DockerイメージをSIFに変換して動かす。

`apptainer pull --arch <cpuArch> <cache>/sif/<digest>-<arch>.sif docker://<image>`は、
（イメージのdigest、CPU）ごとに1回だけ、キャッシュのエントリのロックを取って動く。後のJobはすべて
そのファイルを使い回す。specディレクトリのsecrets.jsonにあるレジストリの認証情報は、CLIの
環境変数だけを通して渡す。
"""

from __future__ import annotations

import re
from collections.abc import Mapping
from pathlib import Path
from typing import Any

from ..errors import ConfigurationError
from ..security import SecretMasker
from ..worker.container_layout import host_environment
from ..worker.contracts import SIF_RUNTIME_KINDS
from ..worker.host_execution import CommandExecution
from ..worker.runtime_capability import runtime_binary
from .daemon_thread import run_in_daemon_thread
from .file_cache import CachedFile, SiteFileCache

PINNED_IMAGE = re.compile(r"@sha256:([a-f0-9]{64})$")
# 変換中にCLIがダウンロードするイメージのレイヤー。容量の小さいホームではなく、SIFの隣に置く。
LAYER_CACHE_DIRECTORY = "sif-layers"
SIF_CACHE_KIND = "sif"


def needs_conversion(runtime: Mapping[str, Any], runtime_kinds: list[str]) -> bool:
    return runtime["kind"] == "docker" and "docker" not in runtime_kinds


def site_sif_kind(runtime_kinds: list[str]) -> str:
    """siteが変換したイメージを動かすSIFのCLI。両方あるときはApptainer。"""
    for kind in ("apptainer", "singularity"):
        if kind in runtime_kinds:
            return kind
    raise ConfigurationError("The site has no Apptainer or Singularity to run a Docker image with")


def converted_sif_name(image: str, cpu_arch: str) -> str:
    match = PINNED_IMAGE.search(image)
    if match is None:
        raise ConfigurationError("A Docker image must be pinned to a sha256 digest to be converted")
    return f"{match.group(1)}-{cpu_arch}.sif"


def pull_environment(kind: str, *, layer_cache: Path, credentials: Mapping[str, Any]) -> dict[str, str]:
    prefix = "APPTAINER" if kind == "apptainer" else "SINGULARITY"
    environment = {**host_environment(), f"{prefix}_CACHEDIR": str(layer_cache)}
    username, password = credentials.get("username"), credentials.get("password")
    if username or password:
        if not isinstance(username, str) or not isinstance(password, str):
            raise ConfigurationError("secrets.json registry needs a username and a password")
        environment[f"{prefix}_DOCKER_USERNAME"] = username
        environment[f"{prefix}_DOCKER_PASSWORD"] = password
    return environment


def pull_argv(binary: str, *, cpu_arch: str, destination: Path, image: str) -> list[str]:
    return [binary, "pull", "--arch", cpu_arch, str(destination), f"docker://{image}"]


async def convert_docker_image(
    image: str,
    *,
    kind: str,
    cpu_arch: str,
    cache: SiteFileCache,
    workspace: Path,
    state: dict[str, Any],
    credentials: Mapping[str, Any],
    masker: SecretMasker,
    cancel_grace_seconds: float,
) -> CachedFile:
    """imageをcpu_arch向けに変換した、キャッシュ済みのSIF。CLIの出力はJobのログへ流す。"""
    if kind not in SIF_RUNTIME_KINDS:
        raise ConfigurationError(f"{kind} cannot convert Docker images")
    name = converted_sif_name(image, cpu_arch)
    environment = pull_environment(
        kind, layer_cache=cache.root.parent / LAYER_CACHE_DIRECTORY, credentials=credentials
    )
    for value in (
        environment.get("APPTAINER_DOCKER_PASSWORD"),
        environment.get("SINGULARITY_DOCKER_PASSWORD"),
    ):
        if value:
            masker.add(value)
    execution = CommandExecution(
        workspace, state, environment=environment, masker=masker, cancel_grace_seconds=cancel_grace_seconds
    )

    async def pull(destination: Path) -> None:
        argv = pull_argv(runtime_binary(kind), cpu_arch=cpu_arch, destination=destination, image=image)
        exit_code, _captured = await run_in_daemon_thread(lambda: execution.run(argv), name="mmt-sif-pull")
        if exit_code:
            raise ConfigurationError(f"{kind} pull of the Docker image exited with status {exit_code}")

    return await cache.ensure(name, pull)


def converted_runtime(runtime: Mapping[str, Any], *, kind: str, cached: CachedFile) -> dict[str, Any]:
    """変換したイメージのhostRuntime。executionSnapshotにはDockerのruntimeを残す。"""
    converted: dict[str, Any] = {"kind": kind, "sha256": cached.sha256, "convertedFrom": runtime["image"]}
    if runtime.get("workingDirectory") is not None:
        converted["workingDirectory"] = runtime["workingDirectory"]
    return converted
