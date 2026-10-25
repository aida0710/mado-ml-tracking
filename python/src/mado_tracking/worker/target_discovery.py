"""コンピュータの設定の元になる、マシン、そのPython、作業ディレクトリを置けるディレクトリを調べる。

1つの固定のPOSIX shスクリプト（posix_script.py）がそれらを報告する。
引数はその上限だけ。値はコンピュータが報告したものだけで、推測は一切しない。
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any

from ..errors import TransportError
from .posix_script import run_posix_script, terminated_tokens
from .reported_text import is_one_line_path
from .transport import CommandTransport

# APIの上限（apps/api/src/domain/targetCheckValidation.ts）。
MAX_TARGET_CHECK_PYTHONS = 20
MAX_TARGET_CHECK_DIRECTORIES = 40
# 候補のPythonはそれぞれ1回起動してバージョンを聞く。応答しないネットワークマウント上の
# condaのように止まるものは諦め、20個でもDISCOVERY_TIMEOUT_SECONDSに収まるようにする。
PYTHON_VERSION_TIMEOUT_SECONDS = 2
# dfは応答しないネットワークマウントで止まる。
DF_TIMEOUT_SECONDS = 5
# 20個のPythonと2回のdfがそれぞれ上限まで掛かった場合（50秒）と、シェル自身の処理の分。
DISCOVERY_TIMEOUT_SECONDS = 60.0
KIBIBYTE = 1024
# 契約のCpuArchの値になる`uname -m`の値。ほかのマシンにはcpuArchが無い。
CPU_ARCH_BY_MACHINE = {"x86_64": "amd64", "amd64": "amd64", "aarch64": "arm64", "arm64": "arm64"}
# APIが受け付ける形のTargetCheckPython.version。
PYTHON_VERSION = re.compile(r"\d{1,3}\.\d{1,3}\.\d{1,3}")
DIRECTORY_SOURCES = frozenset({"home", "home_child", "mount"})
WRITABLE_FLAGS = {"1": True, "0": False}

# 引数: Pythonの最大数、ディレクトリの最大数、Pythonがバージョンを答えるまでにかけてよい秒数、
# dfにかけてよい秒数。出力: NULで終わるトークンで、タグのあとにその値が続く。
#   machine <uname -m>   cpu_count <n>   memory_kib <MemTotal>   home_directory <$HOME>
#   python <path> <version or empty>
#   directory <home|home_child|mount> <path> <writable 1|0> <free KiB or empty>
# ディレクトリはこの順に並ぶ: ホーム、dfのマウント、HPCでよく使うマウントポイント、ホームの下の
# ディレクトリ。上限に達したときは、数の多いホームの下のディレクトリから先に外す。
DISCOVERY_SCRIPT = r"""
main() {
    max_pythons=$1
    max_directories=$2
    python_seconds=$3
    df_seconds=$4
    newline='
'

    emit() {
        printf '%s\000' "$@"
    }

    limited() {
        seconds=$1
        shift
        if command -v timeout >/dev/null 2>&1; then
            timeout "$seconds" "$@"
        else
            "$@"
        fi
    }

    emit machine "$(uname -m 2>/dev/null)"
    emit cpu_count "$(getconf _NPROCESSORS_ONLN 2>/dev/null || nproc 2>/dev/null)"
    emit memory_kib "$(awk '$1 == "MemTotal:" { print $2; exit }' /proc/meminfo 2>/dev/null)"
    emit home_directory "$HOME"

    seen_pythons=$newline
    python_count=0
    pythons() {
        for candidate in "$@"; do
            [ "$python_count" -lt "$max_pythons" ] || return 0
            case $candidate in
                /*) ;;
                *) continue ;;
            esac
            case $candidate in
                *-config|*.py) continue ;;
            esac
            case $seen_pythons in
                *"$newline$candidate$newline"*) continue ;;
            esac
            [ -f "$candidate" ] && [ -x "$candidate" ] || continue
            seen_pythons=$seen_pythons$candidate$newline
            python_count=$((python_count + 1))
            version=$(limited "$python_seconds" "$candidate" -c \
                'import sys; print("%d.%d.%d" % sys.version_info[:3])' 2>/dev/null)
            emit python "$candidate" "$version"
        done
    }
    pythons "$(command -v python3 2>/dev/null)" "$(command -v python 2>/dev/null)"
    pythons /usr/bin/python3 /usr/bin/python3.[0-9]* /usr/local/bin/python3 /usr/local/bin/python3.[0-9]*
    pythons "$HOME"/.venvs/*/bin/python "$HOME"/.venv/bin/python "$HOME"/venv/bin/python
    for conda in miniconda3 anaconda3 miniforge3 mambaforge; do
        pythons "$HOME/$conda/bin/python" "$HOME/$conda"/envs/*/bin/python
    done
    pythons "$HOME"/.pyenv/versions/*/bin/python /opt/conda/bin/python

    seen_directories=$newline
    directory_count=0
    directory() {
        [ "$directory_count" -lt "$max_directories" ] || return 0
        case $seen_directories in
            *"$newline$2$newline"*) return 0 ;;
        esac
        [ -d "$2" ] || return 0
        seen_directories=$seen_directories$2$newline
        directory_count=$((directory_count + 1))
        if [ -w "$2" ]; then writable=1; else writable=0; fi
        emit directory "$1" "$2" "$writable" "$3"
    }

    home_free=$(limited "$df_seconds" df -P -k "$HOME" 2>/dev/null | awk 'NR == 2 { print $4 }')
    directory home "$HOME" "$home_free"

    # Only rows df prints as six fields: a mount point or device with spaces cannot be read back.
    mounts=$(limited "$df_seconds" df -P -k 2>/dev/null | awk 'NR > 1 && NF == 6 { print $4 " " $6 }')
    while read -r free mount; do
        # System locations, and the mounts holding the home (/home), never hold a work directory.
        case $mount in
            /|/boot|/boot/*|/dev|/dev/*|/proc|/proc/*|/sys|/sys/*|/run|/run/*|/snap|/snap/*) continue ;;
            /usr|/usr/*|/etc|/etc/*|/var/lib/*|/var/snap/*|/System/*|/private/*) continue ;;
        esac
        case $HOME/ in
            "$mount"/*) continue ;;
        esac
        directory mount "$mount" "$free"
    done <<MOUNTS
$mounts
MOUNTS
    for candidate in /work /scratch /data /large /fast /lustre /gpfs /groups; do
        directory mount "$candidate" ""
    done
    for candidate in "$HOME"/*; do
        directory home_child "$candidate" ""
    done
    return 0
}
main "$@" </dev/null
"""

# 調査の出力で、各タグのあとに続く値の数。
VALUE_COUNTS = {
    "machine": 1,
    "cpu_count": 1,
    "memory_kib": 1,
    "home_directory": 1,
    "python": 2,
    "directory": 4,
}


def empty_host() -> dict[str, Any]:
    return {
        "machine": None,
        "cpuArch": None,
        "cpuCount": None,
        "memoryTotalBytes": None,
        "homeDirectory": None,
    }


@dataclass(frozen=True)
class TargetDiscovery:
    """契約のTargetCheckHost、TargetCheckPython、TargetCheckDirectoryの値。"""

    host: dict[str, Any] = field(default_factory=empty_host)
    pythons: list[dict[str, Any]] = field(default_factory=list)
    directories: list[dict[str, Any]] = field(default_factory=list)


def decode_token(token: bytes) -> str | None:
    # UTF-8でないパスは画面で入力し直せないので、候補に出さない。
    try:
        return token.decode()
    except UnicodeDecodeError:
        return None


def read_records(raw: bytes) -> list[tuple[str, list[str | None]]]:
    """タグつきのレコード。知らないタグは飛ばし、途中で切れたレコードは捨てる。"""
    tokens = [decode_token(token) for token in terminated_tokens(raw)]
    records = []
    index = 0
    while index < len(tokens):
        tag = tokens[index]
        count = VALUE_COUNTS.get(tag) if tag is not None else None
        if tag is None or count is None or index + 1 + count > len(tokens):
            index += 1
            continue
        records.append((tag, tokens[index + 1 : index + 1 + count]))
        index += 1 + count
    return records


def positive_integer(text: str | None) -> int | None:
    return int(text) if text is not None and text.isdigit() and int(text) > 0 else None


def non_negative_integer(text: str | None) -> int | None:
    return int(text) if text is not None and text.isdigit() else None


def parse_discovery_output(raw: bytes) -> TargetDiscovery:
    host = empty_host()
    pythons: dict[str, dict[str, Any]] = {}
    directories: dict[str, dict[str, Any]] = {}
    for tag, values in read_records(raw):
        if tag == "machine" and values[0]:
            host["machine"] = values[0]
            host["cpuArch"] = CPU_ARCH_BY_MACHINE.get(values[0])
        elif tag == "cpu_count":
            host["cpuCount"] = positive_integer(values[0])
        elif tag == "memory_kib":
            memory_kib = non_negative_integer(values[0])
            host["memoryTotalBytes"] = memory_kib * KIBIBYTE if memory_kib is not None else None
        elif tag == "home_directory" and values[0] is not None and is_one_line_path(values[0]):
            host["homeDirectory"] = values[0]
        elif tag == "python":
            python = parse_python(values)
            if python is not None and len(pythons) < MAX_TARGET_CHECK_PYTHONS:
                pythons.setdefault(python["path"], python)
        elif tag == "directory":
            directory = parse_directory(values)
            if directory is not None and len(directories) < MAX_TARGET_CHECK_DIRECTORIES:
                directories.setdefault(directory["path"], directory)
    return TargetDiscovery(host=host, pythons=list(pythons.values()), directories=list(directories.values()))


def parse_python(values: list[str | None]) -> dict[str, Any] | None:
    path, version = values
    if path is None or not path.startswith("/") or not is_one_line_path(path):
        return None
    return {
        "path": path,
        "version": version if version is not None and PYTHON_VERSION.fullmatch(version) else None,
    }


def parse_directory(values: list[str | None]) -> dict[str, Any] | None:
    source, path, writable, free_kib = values
    if (
        source not in DIRECTORY_SOURCES
        or path is None
        or not is_one_line_path(path)
        or writable not in WRITABLE_FLAGS
    ):
        return None
    free = non_negative_integer(free_kib)
    return {
        "path": path,
        "source": source,
        "writable": WRITABLE_FLAGS[writable],
        "freeBytes": free * KIBIBYTE if free is not None else None,
    }


async def discover_target(transport: CommandTransport) -> TargetDiscovery:
    """コンピュータが自分について報告すること。そこで調査を実行できなければ何も返さない。"""
    try:
        raw = await run_posix_script(
            transport,
            DISCOVERY_SCRIPT,
            [
                str(MAX_TARGET_CHECK_PYTHONS),
                str(MAX_TARGET_CHECK_DIRECTORIES),
                str(PYTHON_VERSION_TIMEOUT_SECONDS),
                str(DF_TIMEOUT_SECONDS),
            ],
            timeout=DISCOVERY_TIMEOUT_SECONDS,
        )
    except (TransportError, TimeoutError):
        # 接続の確認はそのまま実行する。設定はその場合、手で埋める。
        return TargetDiscovery()
    return parse_discovery_output(raw)
