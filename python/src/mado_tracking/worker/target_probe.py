"""Jobを動かす前に、worker自身のtransportでコンピュータを診断する。

workerはマシンを調べ（target_discovery.py）、固定の診断スクリプトを1つコンピュータのPythonに送り、
生の事実をJSONで読み取って、APIのTargetCheckResultに変換する。値はコンピュータが
報告したものだけ。無いツールは無いと報告し、推測したバージョンやGPUで埋めることは無い。
"""

from __future__ import annotations

import json
from typing import Any

from ..errors import ConfigurationError, TransportError
from ..security import SecretMasker
from .sif_container import REQUIRED_SIF_FLAGS
from .target_check_claims import RESULT_VERSION
from .target_check_report import fit_result_size, sanitize_result
from .target_discovery import TargetDiscovery, discover_target
from .transport import CommandTransport, create_target_transport

# host runnerとSDKには、pyproject.tomlのrequires-pythonと同じPythonが要る。
MINIMUM_TARGET_PYTHON = (3, 11)
# 診断はコンピュータの上で短いコマンド（nvidia-smi、docker、APIへのリクエスト）をいくつか実行する。
PROBE_TIMEOUT_SECONDS = 90.0
# コンピュータにまだ作業ディレクトリが無い間に、診断が書き込みを確かめる場所。シェルのホーム。
HOME_DIRECTORY = "~"
# `--nv`が要るのはGPUのJobだけだが、確認ではGPUのコンテナを動かせるかどうかを示すべき。
CONTAINER_EXEC_FLAGS = sorted(REQUIRED_SIF_FLAGS | {"--nv"})
CONTAINER_KINDS = ("apptainer", "singularity")

# 診断の本体より前にインタープリタを報告するので、古すぎたり壊れていたりするPythonでも特定できる。
# どのPython 3でも受け付ける構文だけで書く。
PYTHON_IDENTITY = "import json, sys; print(json.dumps([list(sys.version_info[:3]), sys.executable]))"

# コンピュータの上で、そのコンピュータのPythonで動く。古いインタープリタでも何が
# 足りないかを報告できるよう、Python 3.6以上の標準ライブラリだけを使う。
# argv: 作業ディレクトリ、ヘルスチェックのURL、探すコンテナのexecのフラグのJSONの配列。
PROBE_SCRIPT = r"""
import json, os, shutil, subprocess, sys, tempfile
try:
    from urllib.request import urlopen
except ImportError:
    urlopen = None

COMMAND_TIMEOUT = 15

def run(argv):
    try:
        completed = subprocess.run(
            argv, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
            universal_newlines=True, timeout=COMMAND_TIMEOUT,
        )
    except (OSError, subprocess.SubprocessError):
        return None, ""
    return completed.returncode, completed.stdout[:65536]

def first_line(text):
    lines = text.strip().splitlines()
    return lines[0] if lines else None

def importable(name):
    try:
        __import__(name)
        return True
    except Exception:
        return False

def tool(name, argv):
    path = shutil.which(name)
    if path is None:
        return {"found": False}
    code, output = run([path] + argv)
    return {"found": True, "exitCode": code, "version": first_line(output) if code == 0 else None}

def docker_socket():
    host = os.environ.get("DOCKER_HOST", "")
    if host and not host.startswith("unix://"):
        return None
    path = host[len("unix://"):] if host else "/var/run/docker.sock"
    if not os.path.exists(path):
        return {"exists": False, "accessible": False}
    return {"exists": True, "accessible": os.access(path, os.R_OK | os.W_OK)}

def docker():
    facts = tool("docker", ["--version"])
    if not facts["found"]:
        return facts
    code, output = run([shutil.which("docker"), "version", "--format", "{{.Server.Version}}"])
    facts["serverReachable"] = code == 0
    facts["serverVersion"] = first_line(output) if code == 0 else None
    facts["socket"] = docker_socket()
    return facts

def container(name, flags):
    facts = tool(name, ["--version"])
    if facts["found"]:
        code, output = run([shutil.which(name), "exec", "--help"])
        facts["execFlags"] = [flag for flag in flags if code == 0 and flag in output]
    return facts

def nvidia():
    path = shutil.which("nvidia-smi")
    if path is None:
        return {"found": False}
    code, output = run([path, "--query-gpu=index,uuid,name,memory.total", "--format=csv,noheader,nounits"])
    return {"found": True, "exitCode": code, "rows": output.splitlines()[:256] if code == 0 else []}

def nearest_existing(path):
    while not os.path.exists(path):
        parent = os.path.dirname(path)
        if parent == path:
            break
        path = parent
    return path

def work_directory(path):
    path = os.path.abspath(os.path.expanduser(path))
    existing = nearest_existing(path)
    writable = False
    if os.path.isdir(existing):
        try:
            descriptor, temporary = tempfile.mkstemp(dir=existing, prefix=".mmt-check-")
            os.close(descriptor)
            os.unlink(temporary)
            writable = True
        except OSError:
            writable = False
    try:
        statistics = os.statvfs(existing)
        free = statistics.f_bavail * statistics.f_frsize
    except OSError:
        free = None
    return {"exists": existing == path, "writable": writable, "freeBytes": free}

def api(url):
    if urlopen is None:
        return {"reachable": False, "status": None}
    try:
        response = urlopen(url, timeout=5)
        return {"reachable": 200 <= response.status < 300, "status": response.status}
    except Exception as error:
        return {"reachable": False, "status": getattr(error, "code", None)}

pip_code, pip_output = run([sys.executable, "-m", "pip", "--version"])
print(json.dumps({
    "venv": importable("venv"),
    "ensurepip": importable("ensurepip"),
    "pip": {"found": pip_code == 0, "version": first_line(pip_output) if pip_code == 0 else None},
    "git": tool("git", ["--version"]),
    "docker": docker(),
    "containers": {name: container(name, json.loads(sys.argv[3])) for name in ("apptainer", "singularity")},
    "nvidia": nvidia(),
    "workDirectory": work_directory(sys.argv[1]),
    "api": api(sys.argv[2]),
}))
"""


def item(name: str, status: str, code: str | None = None, detail: str | None = None) -> dict[str, Any]:
    return {"name": name, "status": status, "code": code, "detail": detail}


def failed_facts(name: str, code: str) -> dict[str, Any]:
    """コンピュータがツールを報告する前に止まった確認の事実。"""
    return {
        "items": [item(name, "ng", code)],
        "gpus": None,
        "runtimeKinds": [],
        "workDirectoryFreeBytes": None,
    }


def version_2_result(facts: dict[str, Any], discovery: TargetDiscovery) -> dict[str, Any]:
    return {
        "version": RESULT_VERSION,
        **facts,
        "host": discovery.host,
        "pythons": discovery.pythons,
        "directories": discovery.directories,
    }


def failed_result(name: str, code: str) -> dict[str, Any]:
    """コンピュータが何かを報告する前に止まった確認の結果。"""
    return version_2_result(failed_facts(name, code), TargetDiscovery())


def parse_gpu_rows(rows: list[str]) -> list[dict[str, Any]]:
    """次のコマンドの出力を解析する。

    `nvidia-smi --query-gpu=index,uuid,name,memory.total --format=csv,noheader,nounits`
    """
    gpus = []
    for row in rows:
        # モデル名にはカンマが入り得るので、index・uuidは左から、メモリは右から取る。
        head = row.split(",", 2)
        if len(head) != 3:
            continue
        name, separator, memory = head[2].rpartition(",")
        index, uuid, name, memory = head[0].strip(), head[1].strip(), name.strip(), memory.strip()
        if not separator or not index.isdigit() or not uuid or not name or not memory.isdigit():
            continue
        gpus.append({"index": index, "uuid": uuid, "name": name, "memoryTotalMiB": int(memory)})
    return gpus


def python_item(identity: tuple[list[int], str]) -> dict[str, Any]:
    version, executable = identity
    detail = f"{'.'.join(str(part) for part in version)} {executable}"
    if tuple(version[:2]) < MINIMUM_TARGET_PYTHON:
        return item("python", "ng", "python_too_old", detail)
    return item("python", "ok", detail=detail)


def docker_item(facts: dict[str, Any]) -> dict[str, Any]:
    if not facts.get("found"):
        return item("docker", "unavailable", "docker_missing")
    if facts.get("serverReachable"):
        return item("docker", "ok", detail=facts.get("serverVersion"))
    socket = facts.get("socket")
    if socket and socket.get("exists") and not socket.get("accessible"):
        return item("docker", "ng", "docker_socket_denied", facts.get("version"))
    return item("docker", "ng", "docker_daemon_unreachable", facts.get("version"))


def container_item(kind: str, facts: dict[str, Any]) -> dict[str, Any]:
    if not facts.get("found"):
        return item(kind, "unavailable", "container_cli_missing")
    supported = set(facts.get("execFlags") or [])
    if facts.get("exitCode") != 0 or not supported.issuperset(CONTAINER_EXEC_FLAGS):
        return item(kind, "ng", "container_flags_missing", facts.get("version"))
    return item(kind, "ok", detail=facts.get("version"))


def gpu_item(
    facts: dict[str, Any], *, gpus_expected: bool
) -> tuple[dict[str, Any], list[dict[str, Any]] | None]:
    if not facts.get("found"):
        # CPUだけのコンピュータにはnvidia-smiは要らない。GPUを設定したコンピュータには要る。
        return item("gpu", "ng" if gpus_expected else "unavailable", "nvidia_smi_missing"), None
    if facts.get("exitCode") != 0:
        return item("gpu", "ng", "nvidia_smi_failed"), None
    gpus = parse_gpu_rows(list(facts.get("rows") or []))
    return item("gpu", "ok", detail=str(len(gpus))), gpus


def work_directory_item(facts: dict[str, Any], *, target: dict[str, Any]) -> dict[str, Any]:
    if not target.get("workDirectory"):
        # コンピュータを設定している途中。代わりにディレクトリの候補を出す。
        return item("work_directory", "skipped", "work_directory_not_set")
    if facts.get("writable"):
        return item("work_directory", "ok")
    return item("work_directory", "ng", "work_directory_not_writable")


def build_facts(
    identity: tuple[list[int], str], facts: dict[str, Any], *, target: dict[str, Any]
) -> dict[str, Any]:
    """診断の生の事実を、TargetCheckResultの項目・GPU・runtimeに変換する。"""
    python = python_item(identity)
    venv = item("venv", "ok") if facts.get("venv") else item("venv", "ng", "venv_missing")
    pip_facts = facts.get("pip") or {}
    if pip_facts.get("found"):
        pip = item("pip", "ok", detail=pip_facts.get("version"))
    elif facts.get("ensurepip"):
        # host runnerはensurepipでJobのvenvにpipを入れる。
        pip = item("pip", "ok", detail="ensurepip")
    else:
        pip = item("pip", "ng", "pip_missing")
    git_facts = facts.get("git") or {}
    git = (
        item("git", "ok", detail=git_facts.get("version"))
        if git_facts.get("found") and git_facts.get("exitCode") == 0
        # 必要なのはGitのコードソースだけ。インラインとArtifactのソースはgitなしで動く。
        else item("git", "unavailable", "git_missing")
    )
    docker = docker_item(facts.get("docker") or {})
    containers = {
        kind: container_item(kind, (facts.get("containers") or {}).get(kind) or {})
        for kind in CONTAINER_KINDS
    }
    gpu, gpus = gpu_item(facts.get("nvidia") or {}, gpus_expected=bool(target.get("gpuIds")))
    work_facts = facts.get("workDirectory") or {}
    work_directory = work_directory_item(work_facts, target=target)
    api_facts = facts.get("api") or {}
    status = api_facts.get("status")
    api = (
        item("api", "ok")
        if api_facts.get("reachable")
        else item("api", "ng", "api_unreachable", f"HTTP {status}" if isinstance(status, int) else None)
    )
    runtime_kinds = []
    if all(entry["status"] == "ok" for entry in (python, venv, pip)):
        runtime_kinds.append("python")
    if docker["status"] == "ok":
        runtime_kinds.append("docker")
    runtime_kinds += [kind for kind in ("singularity", "apptainer") if containers[kind]["status"] == "ok"]
    free_bytes = work_facts.get("freeBytes") if target.get("workDirectory") else None
    return {
        "items": [
            item("connection", "ok"),
            python,
            venv,
            pip,
            git,
            docker,
            containers["apptainer"],
            containers["singularity"],
            gpu,
            work_directory,
            api,
        ],
        "gpus": gpus,
        "runtimeKinds": runtime_kinds,
        "workDirectoryFreeBytes": free_bytes if isinstance(free_bytes, int) and free_bytes >= 0 else None,
    }


def parse_identity(raw: bytes) -> tuple[list[int], str]:
    try:
        version, executable = json.loads(raw)
    except (UnicodeDecodeError, ValueError, TypeError):
        raise TransportError("Target Python returned an invalid identity") from None
    if (
        not isinstance(version, list)
        or len(version) != 3
        or not all(isinstance(part, int) for part in version)
        or not isinstance(executable, str)
    ):
        raise TransportError("Target Python returned an invalid identity")
    return version, executable


def parse_facts(raw: bytes) -> dict[str, Any]:
    try:
        facts = json.loads(raw)
    except (UnicodeDecodeError, ValueError):
        raise TransportError("Target probe returned invalid JSON") from None
    if not isinstance(facts, dict):
        raise TransportError("Target probe returned a non-object response")
    return facts


def choose_python(pythons: list[dict[str, Any]]) -> str | None:
    """まだPythonが無いコンピュータ用: 見つかった最初の3.11以上、無ければ最初に応答したもの。"""
    answered = [python for python in pythons if python["version"] is not None]
    for python in answered:
        if tuple(int(part) for part in python["version"].split(".")[:2]) >= MINIMUM_TARGET_PYTHON:
            return str(python["path"])
    return str(answered[0]["path"]) if answered else None


async def probe_target(
    target: dict[str, Any], *, transport: CommandTransport, health_url: str, masker: SecretMasker
) -> dict[str, Any]:
    """段階を踏んで診断し、最初に失敗した段階で問題を示す。

    transportのエラーの文にはsshのstderr（鍵のパスやホスト名）が含まれ得るので、
    失敗はコードだけで報告する。調査に失敗しても、設定の候補が空になるだけ。
    """
    try:
        await transport.run(["true"])
    except (TransportError, TimeoutError):
        return failed_result(
            "connection", "ssh_failed" if target["executor"] == "ssh" else "connection_failed"
        )
    discovery = await discover_target(transport)

    def report(facts: dict[str, Any]) -> dict[str, Any]:
        result = version_2_result(facts, discovery)
        return fit_result_size(sanitize_result(result, target=target, masker=masker))

    python_executable = target.get("pythonExecutable") or choose_python(discovery.pythons)
    if not python_executable:
        return report(with_connection(failed_facts("python", "python_missing")))
    try:
        identity = parse_identity(await transport.run([python_executable, "-c", PYTHON_IDENTITY]))
    except (TransportError, TimeoutError):
        return report(with_connection(failed_facts("python", "python_missing")))
    work_directory = target.get("workDirectory") or discovery.host["homeDirectory"] or HOME_DIRECTORY
    try:
        facts = parse_facts(
            await transport.run(
                [
                    python_executable,
                    "-c",
                    PROBE_SCRIPT,
                    work_directory,
                    health_url,
                    json.dumps(CONTAINER_EXEC_FLAGS),
                ],
                timeout=PROBE_TIMEOUT_SECONDS,
            )
        )
    except (TransportError, TimeoutError):
        # インタープリタは応答したが、診断を実行できなかった（とても古いPythonのことが多い）。
        failed = with_connection(failed_facts("python", "probe_failed"))
        failed["items"][1]["detail"] = python_item(identity)["detail"]
        return report(failed)
    return report(build_facts(identity, facts, target=target))


def with_connection(facts: dict[str, Any]) -> dict[str, Any]:
    return {**facts, "items": [item("connection", "ok"), *facts["items"]]}


async def check_target(
    target: dict[str, Any], *, allow_local_executor: bool, health_url: str, masker: SecretMasker
) -> tuple[str, dict[str, Any]]:
    """完了の状態と結果を返す。`failed`は、workerがまったく診断できなかったことを表す。"""
    try:
        transport = create_target_transport(target, allow_local_executor=allow_local_executor, masker=masker)
    except ConfigurationError:
        # workerホストに鍵やknown_hostsのファイルが無いか、
        # ここではローカルでの実行が許されていない。
        return "failed", failed_result("connection", "ssh_configuration")
    return "finished", await probe_target(target, transport=transport, health_url=health_url, masker=masker)
