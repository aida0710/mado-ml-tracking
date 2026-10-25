"""標準ライブラリだけで動く小さなrunnerとSDKをインストールし、永続的なJobをIDで制御する。"""

from __future__ import annotations

import asyncio
import io
import json
import zipfile
from collections.abc import Awaitable, Callable
from pathlib import Path
from typing import Any, TypeVar

from ..errors import ConfigurationError, TransportError
from ..security import SecretMasker, secret_values
from .config import WorkerSettings
from .contracts import WorkerJob
from .execution_specification import build_execution_specification
from .output_archive import ARCHIVE_REJECTED_EXIT_CODE, OUTPUT_ARCHIVE_COMMAND
from .transport import CONTROL_TIMEOUT_SECONDS, CommandTransport, create_target_transport

StreamResult = TypeVar("StreamResult")
# 拒まれたストリームは短い診断を残す。runnerはstderrに1行書く。
STREAM_DIAGNOSTIC_BYTES = 4096
# host_runnerはJSONのコマンドに応える。出力のアーカイブはバイナリのtarをstdoutに書くので、バンドルの
# 入口は、host_runnerがstdinをJSONのリクエストとして読む前に、それをoutput_archiveへ振り分ける。
RUNNER_MAIN = f"""import sys
if sys.argv[1:2] == [{OUTPUT_ARCHIVE_COMMAND!r}]:
    from runtime.output_archive import run_output_archive_command
    run_output_archive_command(sys.argv)
else:
    from runtime.host_runner import main
    main()
"""


class StreamRejected(ConfigurationError):
    """runnerがストリームのコマンドを拒んだ（例: 検証のあとで出力が変わった）。"""


BOOTSTRAP = """
import hashlib, io, json, os, pathlib, sys, tempfile, zipfile
os.umask(0o077)
root = pathlib.Path(sys.argv[1]).expanduser()
root.mkdir(parents=True, exist_ok=True)
workspace = root / sys.argv[2]
if workspace.is_symlink():
    raise ValueError("Job workspace must not be a symlink")
workspace.mkdir(mode=0o700, exist_ok=True)
workspace.chmod(0o700)
workspace = workspace.resolve()
payload = sys.stdin.buffer.read(8 * 1024 * 1024 + 1)
if len(payload) > 8 * 1024 * 1024:
    raise ValueError("Runtime bundle is too large")
runtime = workspace / ("runner-" + hashlib.sha256(payload).hexdigest()[:16] + ".pyz")
if not runtime.exists():
    descriptor, temporary = tempfile.mkstemp(dir=workspace)
    with os.fdopen(descriptor, "wb") as output:
        output.write(payload)
        output.flush()
        os.fsync(output.fileno())
    os.replace(temporary, runtime)
    with zipfile.ZipFile(io.BytesIO(payload)) as archive:
        for member in archive.infolist():
            if member.filename.startswith("sdk/mado_tracking/") and not member.is_dir():
                path = workspace / member.filename
                if not path.resolve().is_relative_to(workspace):
                    raise ValueError("Runtime bundle path escapes workspace")
                path.parent.mkdir(parents=True, exist_ok=True)
                if not (workspace / "state.json").exists() or not path.exists():
                    path.write_bytes(archive.read(member))
print(json.dumps({"workspace": str(workspace), "runtime": str(runtime)}))
"""


def build_runtime_bundle() -> bytes:
    package_directory = Path(__file__).resolve().parent.parent
    archive_buffer = io.BytesIO()
    with zipfile.ZipFile(archive_buffer, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        archive.writestr("__main__.py", RUNNER_MAIN)
        archive.writestr("runtime/__init__.py", "")
        archive.write(package_directory / "security.py", "runtime/security.py")
        archive.write(package_directory / "timestamps.py", "runtime/timestamps.py")
        archive.write(package_directory / "execution_runtime.py", "runtime/execution_runtime.py")
        archive.write(package_directory / "code_source.py", "runtime/code_source.py")
        archive.write(package_directory / "execution_snapshot.py", "runtime/execution_snapshot.py")
        archive.write(package_directory / "system_metrics.py", "runtime/system_metrics.py")
        archive.write(package_directory / "checkpoint_archive.py", "runtime/checkpoint_archive.py")
        for name in (
            "host_runner",
            "host_state",
            "host_execution",
            "source",
            "telemetry",
            "container_layout",
            "container_outputs",
            "output_archive",
            "runtime_capability",
            "docker_container",
            "sif_container",
            "job_execution",
            "source_snapshot",
            "source_tree",
            "artifact_files",
            "dataset_cache",
            "dataset_downloads",
            "dataset_runner",
            "workflow_context",
        ):
            source = (package_directory / "worker" / f"{name}.py").read_text()
            archive.writestr(
                f"runtime/{name}.py",
                source.replace("from ..security", "from .security")
                .replace("from ..timestamps", "from .timestamps")
                .replace("from ..execution_runtime", "from .execution_runtime")
                .replace("from ..code_source", "from .code_source")
                .replace("from ..execution_snapshot", "from .execution_snapshot")
                .replace("from ..system_metrics", "from .system_metrics")
                .replace("from ..checkpoint_archive", "from .checkpoint_archive"),
            )
        for path in package_directory.glob("*.py"):
            archive.write(path, f"sdk/mado_tracking/{path.name}")
        for path in (package_directory / "offline").glob("*.py"):
            archive.write(path, f"sdk/mado_tracking/offline/{path.name}")
        archive.write(package_directory / "py.typed", "sdk/mado_tracking/py.typed")
    return archive_buffer.getvalue()


def execution_specification(job: WorkerJob, settings: WorkerSettings) -> dict[str, Any]:
    """workerのspec.json。Jobは、APIがそのJobのために予約したGPUで動く。"""
    return build_execution_specification(
        job,
        api=settings.api,
        gpu_ids=job.job["gpuIds"],
        install_dependencies=settings.install_dependencies,
        cancel_grace_seconds=settings.cancel_grace_seconds,
        max_output_files=settings.max_output_files,
    )


class JobExecutor:
    def __init__(
        self, job: WorkerJob, settings: WorkerSettings, *, transport: CommandTransport | None = None
    ):
        self.job = job
        self.settings = settings
        self.masker = SecretMasker(
            [settings.api.token, job.job_token or "", *secret_values(job.code_version["environment"])]
        )
        self.transport = transport or create_target_transport(
            self.job.target, allow_local_executor=self.settings.allow_local_executor, masker=self.masker
        )
        self.workspace: str | None = None
        self.runtime: str | None = None
        self.bundle = build_runtime_bundle()
        self.staged_inputs: dict[str, Any] = {}

    async def install_runtime(self) -> None:
        target = self.job.target
        output = await self.transport.run(
            [target["pythonExecutable"], "-c", BOOTSTRAP, target["workDirectory"], self.job.id],
            stdin=self.bundle,
        )
        response = self._response(output)
        if not isinstance(response.get("workspace"), str) or not isinstance(response.get("runtime"), str):
            raise TransportError("Compute bootstrap did not return a workspace")
        self.workspace = response["workspace"]
        self.runtime = response["runtime"]

    async def command(
        self, name: str, *, payload: dict[str, Any] | None = None, stdin_file: Path | None = None
    ) -> dict[str, Any]:
        if self.workspace is None or self.runtime is None:
            raise ConfigurationError("Runtime must be installed before job control")
        output = await self.transport.run(
            [self.job.target["pythonExecutable"], self.runtime, name, self.workspace],
            stdin=stdin_file or json.dumps(payload or {}, allow_nan=False).encode(),
            timeout=None if stdin_file else CONTROL_TIMEOUT_SECONDS,
        )
        return self._response(output)

    async def stream_command(
        self,
        name: str,
        *,
        payload: dict[str, Any],
        consume: Callable[[asyncio.StreamReader], Awaitable[StreamResult]],
    ) -> StreamResult:
        """stdoutをストリームとして読む、runnerのプロセス1つ。応答のサイズの上限は掛けない。

        ストリームが早く終わると、読む側のエラーを送出する。ただしrunnerが
        ARCHIVE_REJECTED_EXIT_CODEで終了していれば、StreamRejected（再試行しても成功しない）にする。
        """
        if self.workspace is None or self.runtime is None:
            raise ConfigurationError("Runtime must be installed before job control")
        argv = self.transport.command_argv(
            [self.job.target["pythonExecutable"], self.runtime, name, self.workspace]
        )
        try:
            process = await asyncio.create_subprocess_exec(
                *argv,
                stdin=asyncio.subprocess.PIPE,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
        except OSError:
            raise TransportError("Could not start the compute transport") from None
        if process.stdin is None or process.stdout is None or process.stderr is None:
            raise TransportError("Compute transport pipes are unavailable")
        stderr_task = asyncio.create_task(_read_bounded(process.stderr, STREAM_DIAGNOSTIC_BYTES))
        try:
            try:
                process.stdin.write(json.dumps(payload, allow_nan=False).encode())
                await process.stdin.drain()
                process.stdin.close()
                result = await consume(process.stdout)
            except (EOFError, BrokenPipeError, ConnectionResetError) as error:
                # リクエストを拒んだrunnerは、すべてを読み書きする前に終了する。
                await self._raise_for_finished_exit(process, stderr_task)
                if isinstance(error, EOFError):
                    raise
                raise TransportError("Compute transport closed the stream") from None
            self._raise_for_exit(await process.wait(), await stderr_task)
            return result
        finally:
            if process.returncode is None:
                process.kill()
                await process.wait()
            stderr_task.cancel()
            await asyncio.gather(stderr_task, return_exceptions=True)

    async def _raise_for_finished_exit(
        self, process: asyncio.subprocess.Process, stderr_task: asyncio.Task[bytes]
    ) -> None:
        try:
            async with asyncio.timeout(CONTROL_TIMEOUT_SECONDS):
                exit_code = await process.wait()
                stderr = await stderr_task
        except TimeoutError:
            # 止まったrunnerはまだ生きている。呼び出し側のエラーをそのまま使い、プロセスはkillする。
            return
        self._raise_for_exit(exit_code, stderr)

    def _raise_for_exit(self, exit_code: int, stderr: bytes) -> None:
        if not exit_code:
            return
        diagnostic = self.masker.mask(stderr.decode("utf-8", "replace")).strip()
        if exit_code == ARCHIVE_REJECTED_EXIT_CODE:
            raise StreamRejected(diagnostic or "Compute runner refused the stream")
        raise TransportError(f"Compute transport exited ({exit_code}): {diagnostic}")

    async def poll(
        self, offsets: dict[str, int], *, telemetry: bool = False, step: int = 0
    ) -> dict[str, Any]:
        return await self.command("poll", payload={"offsets": offsets, "telemetry": telemetry, "step": step})

    async def start(self) -> dict[str, Any]:
        specification = execution_specification(self.job, self.settings)
        specification["stagedInputs"] = self.staged_inputs
        return await self.command("start", payload=specification)

    async def cancel(self) -> dict[str, Any]:
        return await self.command("cancel")

    def _response(self, raw: bytes) -> dict[str, Any]:
        try:
            response = json.loads(raw)
        except (UnicodeDecodeError, ValueError):
            raise TransportError("Compute runner returned invalid JSON") from None
        if not isinstance(response, dict):
            raise TransportError("Compute runner returned a non-object response")
        return response


async def _read_bounded(reader: asyncio.StreamReader, maximum_bytes: int) -> bytes:
    """パイプを読み切ってプロセスがそこで詰まらないようにし、先頭のバイトだけを残す。"""
    kept = bytearray()
    while chunk := await reader.read(STREAM_DIAGNOSTIC_BYTES):
        kept.extend(chunk[: max(0, maximum_bytes - len(kept))])
    return bytes(kept)
