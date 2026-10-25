"""launcherや`mado-tracking submit`が、siteの作業ディレクトリで行う操作。

    <work dir>/.mmt-runner/<version>/        mmt-runner.pyzとmmt-runnerのラッパー
    <work dir>/.mmt-job-shells/<sha256>/     job.sh。job shellの内容ごとに1ディレクトリ
    <work dir>/.mmt-submissions/<name>/      投入ごとに1つのspecディレクトリ

各手順はsiteのtransportを通した1つのコマンドで、ファイルはtarとしてstdinで届く。そのため、どの値も
シェルスクリプトに貼り込まない。インストールしたディレクトリは、そろったときにだけ現れる。
"""

from __future__ import annotations

import hashlib
import posixpath
from collections.abc import Mapping

from ..errors import ConfigurationError
from .bundle import RUNNER_BUNDLE_NAME, RUNNER_WRAPPER_NAME, RunnerInstallation
from .file_archive import EXECUTABLE_FILE_MODE, PRIVATE_FILE_MODE, pack_files
from .transport import CommandResult, SiteTransport

RUNNER_DIRECTORY = ".mmt-runner"
JOB_SHELL_DIRECTORY = ".mmt-job-shells"
SUBMISSIONS_DIRECTORY = ".mmt-submissions"
JOB_SHELL_NAME = "job.sh"
JOB_SHELL_VERSION_CHARACTERS = 16
SETUP_TIMEOUT_SECONDS = 300.0
# 投入は、APIが未報告の投入を待つ15分より十分前に終わらせる。
JOB_SHELL_TIMEOUT_SECONDS = 600.0
CANCEL_TIMEOUT_SECONDS = 120.0
# stdinのtarを<base>/<name>に展開し、renameで公開する。既にあるインストールはそのまま残す。
INSTALL_SCRIPT = (
    'set -e; umask 077; mkdir -p "$1"; staging=$(mktemp -d "$1/.install.XXXXXX"); '
    'tar -x -f - -C "$staging"; '
    'if [ -e "$1/$2" ]; then rm -rf "$staging"; else mv "$staging" "$1/$2"; fi'
)
# 同上。ただし、この投入の前の試行が途中で止まって残したものを置き換える。
REPLACE_SCRIPT = (
    'set -e; umask 077; mkdir -p "$1"; staging=$(mktemp -d "$1/.write.XXXXXX"); '
    'tar -x -f - -C "$staging"; rm -rf "$1/$2"; mv "$staging" "$1/$2"'
)
RUN_IN_DIRECTORY_SCRIPT = 'cd "$1" && shift && exec "$@"'
UNSAFE_NAME_CHARACTERS = "/\r\n\x00"


def _checked_name(name: str) -> str:
    if not name or name in {".", ".."} or any(character in name for character in UNSAFE_NAME_CHARACTERS):
        raise ConfigurationError(f"Invalid site directory name {name!r}")
    return name


class SiteOperations:
    def __init__(self, transport: SiteTransport, *, work_directory: str):
        if not work_directory.startswith("/") or any(c in work_directory for c in "\r\n\x00"):
            raise ConfigurationError("The site work directory must be an absolute path")
        self.transport = transport
        self.work_directory = work_directory.rstrip("/") or "/"

    def path(self, *parts: str) -> str:
        return posixpath.join(self.work_directory, *parts)

    def _checked(self, result: CommandResult, action: str) -> CommandResult:
        if result.exit_code:
            detail = self.transport.diagnostic(result.stderr)
            raise ConfigurationError(f"{action} failed on the site ({result.exit_code}): {detail}")
        return result

    def ensure_installed(
        self, base: str, name: str, files: Mapping[str, tuple[bytes, int]], *, probe: str
    ) -> str:
        """filesをbase/nameの下に一度だけインストールする。

        `probe`は、あればインストール済みと分かるファイル。
        """
        directory = posixpath.join(base, _checked_name(name))
        present = self.transport.run(
            ["test", "-f", posixpath.join(directory, probe)], timeout=SETUP_TIMEOUT_SECONDS
        )
        if present.exit_code:
            self._checked(
                self.transport.run(
                    ["sh", "-c", INSTALL_SCRIPT, "mmt-install", base, name],
                    stdin=pack_files(files),
                    timeout=SETUP_TIMEOUT_SECONDS,
                ),
                "Installing files",
            )
        return directory

    def ensure_runner(self, installation: RunnerInstallation) -> str:
        """runnerのこのバージョンを一度だけインストールし、MMT_RUNNERを返す。"""
        directory = self.ensure_installed(
            self.path(RUNNER_DIRECTORY),
            installation.version,
            {
                RUNNER_BUNDLE_NAME: (installation.bundle, PRIVATE_FILE_MODE),
                RUNNER_WRAPPER_NAME: (installation.wrapper, EXECUTABLE_FILE_MODE),
            },
            probe=RUNNER_WRAPPER_NAME,
        )
        return posixpath.join(directory, RUNNER_WRAPPER_NAME)

    def ensure_job_shell(self, content: bytes) -> str:
        """job shellのこのバージョンを一度だけインストールする。

        Runのjob shellは内容から名前を付ける。
        """
        version = hashlib.sha256(content).hexdigest()[:JOB_SHELL_VERSION_CHARACTERS]
        directory = self.ensure_installed(
            self.path(JOB_SHELL_DIRECTORY),
            version,
            {JOB_SHELL_NAME: (content, EXECUTABLE_FILE_MODE)},
            probe=JOB_SHELL_NAME,
        )
        return posixpath.join(directory, JOB_SHELL_NAME)

    def write_spec_directory(self, name: str, files: Mapping[str, tuple[bytes, int]]) -> str:
        self._checked(
            self.transport.run(
                [
                    "sh",
                    "-c",
                    REPLACE_SCRIPT,
                    "mmt-write",
                    self.path(SUBMISSIONS_DIRECTORY),
                    _checked_name(name),
                ],
                stdin=pack_files(files),
                timeout=SETUP_TIMEOUT_SECONDS,
            ),
            "Writing the spec directory",
        )
        return self.path(SUBMISSIONS_DIRECTORY, name)

    def run_job_shell(
        self, job_shell: str, *, spec_directory: str, environment: Mapping[str, str]
    ) -> CommandResult:
        # `env`はNAME=valueを1つずつ別の引数で受け取る。シェルが評価するものは無い。
        assignments = [f"{name}={value}" for name, value in environment.items()]
        return self.transport.run(
            [
                "sh",
                "-c",
                RUN_IN_DIRECTORY_SCRIPT,
                "mmt-job-shell",
                spec_directory,
                "env",
                *assignments,
                job_shell,
            ],
            timeout=JOB_SHELL_TIMEOUT_SECONDS,
        )

    def cancel(self, cancel_command: str, *, scheduler_job_id: str) -> CommandResult:
        """スケジューラの1つのジョブに対して、siteの取消コマンド（設定のシェルの文）を実行する。"""
        return self.transport.run(
            ["env", f"MMT_SCHEDULER_JOB_ID={scheduler_job_id}", "sh", "-c", cancel_command],
            timeout=CANCEL_TIMEOUT_SECONDS,
        )
