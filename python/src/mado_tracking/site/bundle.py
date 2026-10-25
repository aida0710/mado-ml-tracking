"""siteが計算ノードで実行するrunner。このパッケージとhttpxをまとめたzipapp。

`python3 mmt-runner.pyz site-run <spec dir>`は`mado-tracking site-run <spec dir>`と同じ。
隣に置く`mmt-runner`のラッパーは、siteのPythonでzipappを起動する。job shellがMMT_RUNNERとして
受け取るのはこのラッパー。httpxと、その純粋なPythonの依存はbundleを作る環境から写すので、
計算ノードにはPython 3.11以降さえあればよい。
"""

from __future__ import annotations

import hashlib
import io
import re
import shlex
import zipfile
from dataclasses import dataclass
from functools import cache
from importlib import metadata
from pathlib import Path, PurePosixPath

from ..errors import ConfigurationError

RUNNER_BUNDLE_NAME = "mmt-runner.pyz"
RUNNER_WRAPPER_NAME = "mmt-runner"
BUNDLE_MAIN = "from mado_tracking.cli import main\nraise SystemExit(main())\n"
# SDKが唯一依存するサードパーティのパッケージ（pyproject.toml）。その依存もいっしょに入れる。
VENDORED_DISTRIBUTION = "httpx"
# site上でインストールしたバージョンの名前に使う、bundleのdigestの文字数。
VERSION_CHARACTERS = 16
REQUIREMENT_NAME = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]*")
EXCLUDED_SUFFIXES = {".pyc", ".pyo", ".so", ".pyd"}
# すべての項目にこの時刻とモードを付ける。そうすると、bundleのバイト列と、siteがそれを
# インストールするバージョンが、ファイルの中身だけで決まる。プロセスが作った時刻にも、
# パッケージをインストールした時刻にもよらない。時刻はzipが持てる最も古い値。
ENTRY_DATE_TIME = (1980, 1, 1, 0, 0, 0)
ENTRY_MODE = 0o644


@dataclass(frozen=True)
class RunnerInstallation:
    """site上の<work dir>/.mmt-runner/<version>/にインストールするファイル。"""

    version: str
    bundle: bytes
    wrapper: bytes


def _requirement_names(distribution: str) -> list[str]:
    names = []
    for requirement in metadata.requires(distribution) or []:
        name, _separator, marker = requirement.partition(";")
        if "extra" in marker:
            continue
        match = REQUIREMENT_NAME.match(name.strip())
        if match:
            names.append(match.group(0))
    return names


def _distribution_closure(root: str) -> list[metadata.Distribution]:
    """そのdistributionと、それが必要とし、ここにインストールされているものすべて
    （markerは考えない）。"""
    pending, seen, found = [root], set(), []
    while pending:
        name = pending.pop()
        normalized = re.sub(r"[-_.]+", "-", name).lower()
        if normalized in seen:
            continue
        seen.add(normalized)
        try:
            distribution = metadata.distribution(name)
        except metadata.PackageNotFoundError:
            if name == root:
                raise ConfigurationError(f"{root} must be installed to build the runner bundle") from None
            # 別のPythonのバージョン向けの依存（例えば3.13でのtyping_extensions）。
            continue
        found.append(distribution)
        pending.extend(_requirement_names(name))
    return found


def vendored_files(root: str = VENDORED_DISTRIBUTION) -> list[tuple[str, Path]]:
    """closureのimportできる各ファイルの(zipapp内での名前, インストール済みのファイル)。"""
    files: list[tuple[str, Path]] = []
    for distribution in _distribution_closure(root):
        for entry in distribution.files or []:
            path = PurePosixPath(str(entry))
            if (
                not path.parts
                or path.parts[0] == ".."
                or path.parts[0].endswith((".dist-info", ".egg-info"))
                or "__pycache__" in path.parts
                or path.suffix in EXCLUDED_SUFFIXES
            ):
                continue
            located = Path(str(distribution.locate_file(entry)))
            if located.is_file():
                files.append((path.as_posix(), located))
    return files


def _add_entry(archive: zipfile.ZipFile, name: str, content: bytes) -> None:
    entry = zipfile.ZipInfo(name, date_time=ENTRY_DATE_TIME)
    entry.compress_type = zipfile.ZIP_DEFLATED
    entry.external_attr = ENTRY_MODE << 16
    archive.writestr(entry, content)


def build_runner_bundle() -> bytes:
    package_directory = Path(__file__).resolve().parent.parent
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w") as archive:
        _add_entry(archive, "__main__.py", BUNDLE_MAIN.encode())
        for path in sorted(package_directory.rglob("*")):
            if path.is_file() and "__pycache__" not in path.parts and path.suffix not in EXCLUDED_SUFFIXES:
                name = f"mado_tracking/{path.relative_to(package_directory).as_posix()}"
                _add_entry(archive, name, path.read_bytes())
        for name, path in sorted(vendored_files()):
            _add_entry(archive, name, path.read_bytes())
    return buffer.getvalue()


def runner_wrapper(python_executable: str) -> bytes:
    """MMT_RUNNER（`mmt-runner <spec dir>`）。MMT_RUNNER_PYTHONでsiteのPythonを差し替えられる。"""
    if not python_executable or any(character in python_executable for character in "\r\n\x00"):
        raise ConfigurationError("runner_python must be one command without newlines")
    return (
        "#!/bin/sh\n"
        "# Installed by mado ML Tracking; starts the site runner (mado-tracking site-run).\n"
        'python="${MMT_RUNNER_PYTHON:-}"\n'
        f'if [ -z "$python" ]; then python={shlex.quote(python_executable)}; fi\n'
        f'exec "$python" "$(dirname "$0")/{RUNNER_BUNDLE_NAME}" site-run "$@"\n'
    ).encode()


@cache
def _bundle() -> bytes:
    # launcherの動作中にパッケージは変わらないので、zipappはプロセスごとに1回だけ作る。
    return build_runner_bundle()


def runner_installation(python_executable: str) -> RunnerInstallation:
    bundle, wrapper = _bundle(), runner_wrapper(python_executable)
    version = hashlib.sha256(bundle + b"\n" + wrapper).hexdigest()[:VERSION_CHARACTERS]
    return RunnerInstallation(version=version, bundle=bundle, wrapper=wrapper)
