"""siteでargvのコマンドを動かす。ローカルか、アカウントごとに1本の共有接続でOpenSSHを使う。

SSHの設定はlauncherが書く非公開のssh_configに置くので、経由するホスト（`-J`）にもログイン先と
同じknown_hosts、鍵、BatchModeが効く。ControlMasterが（site、アカウント、鍵）ごとに1本の接続を
コマンドの間も開いておく。接続確認だけは接続を共有せず、自分でログインする。

siteが拒んだログインは1回だけ失敗する。masterが失敗したあと、コマンドは自分でログインし直さない。
またLoginRefusedで、もう一度試してもログインの失敗が増えるだけだと呼び出し側に伝える。
"""

from __future__ import annotations

import hashlib
import os
import re
import shlex
import subprocess
import tempfile
from collections.abc import Sequence
from dataclasses import dataclass, field
from pathlib import Path

from ..errors import ConfigurationError, TransportError
from ..security import SecretMasker
from ..worker.transport import SSH_CONNECT_TIMEOUT_SECONDS

# 呼び出し側が上限を決めないとき、launcherがsiteの1つのコマンドを待つ時間。
DEFAULT_COMMAND_TIMEOUT_SECONDS = 600.0
# 共有の接続は、最後のコマンドからこの時間が経つと閉じる。
CONTROL_PERSIST_SECONDS = 60
SERVER_ALIVE_INTERVAL_SECONDS = 30
# 接続そのものに失敗したとき、OpenSSHは255で終わる。
SSH_CONNECTION_FAILED_EXIT_CODE = 255
DIAGNOSTIC_CHARACTERS = 2000
# siteが鍵を拒んだとき、またはホスト鍵がknown_hostsに無いときのOpenSSHの文言。誰かが
# authorized_keysかknown_hostsを変えるまで、何度試しても同じように失敗する。
LOGIN_REFUSALS = ("Permission denied", "Host key verification failed")
# <state dir>/ssh/<endpoint key>.configと.socket。1つの接続先のssh_configとcontrol socket。
SSH_DIRECTORY = "ssh"
ENDPOINT_KEY_CHARACTERS = 16
# Linuxのsockaddr_unは108バイトまでで、sshはまずcontrol socketのパスに"."と16文字の乱数を足した
# 場所でbindする。これより深い状態ディレクトリの下では接続を共有できない。
MAX_CONTROL_PATH_BYTES = 90
# 経由するホストの[user@]host[:port]。
JUMP_HOST = re.compile(r"^(?:[A-Za-z0-9._-]+@)?[A-Za-z0-9.-]+(?::\d{1,5})?$")
UNSAFE_CONFIG_CHARACTERS = '"\r\n\x00'


class LoginRefused(TransportError):
    """siteがログインを拒んだ（またはホスト鍵が未知だった）。すぐに再試行しても意味が無い。"""


@dataclass(frozen=True)
class CommandResult:
    exit_code: int
    stdout: bytes
    stderr: bytes


class SiteTransport:
    """argvをそのまま動かす。サブクラスはargvを包み（SSH）、接続の失敗を見分ける。"""

    def __init__(self, *, masker: SecretMasker):
        self.masker = masker

    def command_argv(self, argv: Sequence[str]) -> list[str]:
        return list(argv)

    def run(
        self, argv: Sequence[str], *, stdin: bytes = b"", timeout: float = DEFAULT_COMMAND_TIMEOUT_SECONDS
    ) -> CommandResult:
        try:
            # 独立したsessionで動かす。`mado-tracking submit --watch`に向けたCtrl-Cで、投入の途中の
            # job shellを切ってはいけない。
            completed = subprocess.run(
                self.command_argv(argv),
                input=stdin,
                capture_output=True,
                timeout=timeout,
                check=False,
                start_new_session=True,
            )
        except OSError:
            raise TransportError("Could not start the site transport") from None
        except subprocess.TimeoutExpired:
            raise TransportError(f"The site command did not finish within {timeout:.0f} seconds") from None
        result = CommandResult(completed.returncode, completed.stdout, completed.stderr)
        self.check_connection(result)
        return result

    def check_connection(self, result: CommandResult) -> None:
        """コマンドではなく接続が失敗したと結果から分かるとき、TransportErrorを送出する。"""

    def diagnostic(self, stderr: bytes) -> str:
        return self.masker.mask(stderr.decode("utf-8", "replace"))[-DIAGNOSTIC_CHARACTERS:].strip()

    def close(self) -> None:
        """共有の接続を解放する。ローカルのtransportは何も持たない。"""


class LocalSiteTransport(SiteTransport):
    """このマシンでコマンドを動かす。ログインノードや対象のPCの上で動く`mado-tracking submit`用。"""


@dataclass(frozen=True)
class SshEndpoint:
    host: str
    port: int
    user: str
    identity_file: Path
    known_hosts: Path
    jump_hosts: tuple[str, ...] = field(default=())

    def __post_init__(self) -> None:
        if not self.host or self.host.startswith("-") or any(c in self.host for c in " \r\n\x00@"):
            raise ConfigurationError("Invalid SSH host")
        if not self.user or self.user.startswith("-") or any(c in self.user for c in " @\r\n\x00"):
            raise ConfigurationError("Invalid SSH user")
        if not isinstance(self.port, int) or isinstance(self.port, bool) or not 1 <= self.port <= 65535:
            raise ConfigurationError("Invalid SSH port")
        for jump in self.jump_hosts:
            if not JUMP_HOST.fullmatch(jump):
                raise ConfigurationError(f"Invalid jump host {jump!r}; use [user@]host[:port]")
        for path in (self.identity_file, self.known_hosts):
            if any(character in str(path) for character in UNSAFE_CONFIG_CHARACTERS):
                raise ConfigurationError("SSH key and known_hosts paths must not contain quotes or newlines")

    def check_files(self) -> None:
        if not self.identity_file.is_file() or not self.known_hosts.is_file():
            raise ConfigurationError("SSH key and existing known_hosts files are required")
        if os.stat(self.identity_file).st_mode & 0o077:
            raise ConfigurationError("SSH private key file must not be readable by group or others")

    @property
    def key(self) -> str:
        identity = "\n".join(
            [self.host, str(self.port), self.user, str(self.identity_file), *self.jump_hosts]
        )
        return hashlib.sha256(identity.encode()).hexdigest()[:ENDPOINT_KEY_CHARACTERS]


def control_path(state_directory: Path, endpoint_key: str) -> Path:
    return state_directory / SSH_DIRECTORY / f"{endpoint_key}.socket"


def connections_can_be_shared(state_directory: Path) -> bool:
    """control socketが状態ディレクトリに収まるか。収まらなければ各コマンドが単独でログインする。"""
    path = control_path(state_directory, "0" * ENDPOINT_KEY_CHARACTERS)
    return len(os.fsencode(path)) <= MAX_CONTROL_PATH_BYTES


def _config_path(path: Path) -> str:
    # ssh_configはこれらの値の%トークンを展開するので、文字としての%は2つ重ねて書く。
    return '"' + str(path).replace("%", "%%") + '"'


def ssh_config_text(endpoint: SshEndpoint) -> str:
    """ログイン先と経由する全ホストの設定（`ssh -F`は経由するホストにもこのファイルを渡す）。"""
    return "\n".join(
        [
            "Host *",
            f"  User {endpoint.user}",
            "  BatchMode yes",
            "  StrictHostKeyChecking yes",
            f"  UserKnownHostsFile {_config_path(endpoint.known_hosts)}",
            "  GlobalKnownHostsFile /dev/null",
            "  IdentitiesOnly yes",
            f"  IdentityFile {_config_path(endpoint.identity_file)}",
            f"  ConnectTimeout {SSH_CONNECT_TIMEOUT_SECONDS}",
            f"  ServerAliveInterval {SERVER_ALIVE_INTERVAL_SECONDS}",
            "",
        ]
    )


class SshSiteTransport(SiteTransport):
    """`shared_connection=False`ならコマンドごとに新しくログインする。接続確認にはこれが要る。

    control socketを置けないほど深い状態ディレクトリの下のtransportも、すべて同じように動く。
    """

    def __init__(
        self,
        endpoint: SshEndpoint,
        *,
        state_directory: Path,
        masker: SecretMasker,
        shared_connection: bool = True,
    ):
        super().__init__(masker=masker)
        endpoint.check_files()
        self.endpoint = endpoint
        self.shared_connection = shared_connection and connections_can_be_shared(state_directory)
        directory = state_directory / SSH_DIRECTORY
        directory.mkdir(mode=0o700, parents=True, exist_ok=True)
        self.config_file = directory / f"{endpoint.key}.config"
        self.control_path = control_path(state_directory, endpoint.key)
        descriptor = os.open(self.config_file, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
        with os.fdopen(descriptor, "w", encoding="utf-8") as output:
            output.write(ssh_config_text(endpoint))

    def _base_argv(self) -> list[str]:
        argv = ["ssh", "-F", str(self.config_file)]
        # ControlPathが無ければsshは何も共有しない。-Fを付けているので、~/.ssh/configがControlPathを
        # 指定することも無い。
        if self.shared_connection:
            argv += ["-o", f"ControlPath={self.control_path}"]
        argv += ["-p", str(self.endpoint.port), "-l", self.endpoint.user]
        if self.endpoint.jump_hosts:
            argv += ["-J", ",".join(self.endpoint.jump_hosts)]
        return argv

    def command_argv(self, argv: Sequence[str]) -> list[str]:
        sharing = ["-o", "ControlMaster=no"] if self.shared_connection else []
        # リモートのログインシェルがコマンドラインを解釈するので、引数は1つずつクォートする。
        return [*self._base_argv(), *sharing, "--", self.endpoint.host, shlex.join(argv)]

    def run(
        self, argv: Sequence[str], *, stdin: bytes = b"", timeout: float = DEFAULT_COMMAND_TIMEOUT_SECONDS
    ) -> CommandResult:
        if self.shared_connection and not self.master_answers():
            self.start_master()
        return super().run(argv, stdin=stdin, timeout=timeout)

    def master_answers(self) -> bool:
        """control socketにmasterが応答するか。masterのいないsocketが残っていれば消す。

        launcherと一緒に止められたmaster（SIGKILLやコンテナの終了）は、状態ディレクトリに
        socketを残す。残ったままだと、どのコマンドもそのsocketを試してから単独でログインすることに
        なり、そのパスで新しいmasterを起動できない。
        """
        if not self.control_path.exists():
            return False
        if self.control("check") == 0:
            return True
        self.control_path.unlink(missing_ok=True)
        return False

    def control(self, command: str) -> int | None:
        """socketを通してmasterに`ssh -O <command>`を送る。終了コードを返し、動かなければNone。"""
        try:
            return subprocess.run(
                [*self._base_argv(), "-O", command, "--", self.endpoint.host],
                stdin=subprocess.DEVNULL,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                timeout=SSH_CONNECT_TIMEOUT_SECONDS,
                check=False,
            ).returncode
        except (OSError, subprocess.TimeoutExpired):
            return None

    def start_master(self) -> None:
        """1回ログインし、コマンドのために接続をバックグラウンドで開いたままにする。

        出力を捕まえているコマンドがmasterを起動すると、ControlPersistが切れるまでmasterが
        そのパイプを開いたままにすることがある。そのためmasterは単独で起動し、同じ理由でstderrも
        パイプではなくファイルに送る。ログインできなければここでエラーを送出する。そうしないと、
        コマンドが自分でもう一度ログインして、また失敗する。
        """
        timeout = SSH_CONNECT_TIMEOUT_SECONDS * (len(self.endpoint.jump_hosts) + 2)
        with tempfile.TemporaryFile() as errors:
            try:
                completed = subprocess.run(
                    [
                        *self._base_argv(),
                        "-o",
                        "ControlMaster=yes",
                        "-o",
                        f"ControlPersist={CONTROL_PERSIST_SECONDS}",
                        "-f",
                        "-N",
                        "--",
                        self.endpoint.host,
                    ],
                    stdin=subprocess.DEVNULL,
                    stdout=subprocess.DEVNULL,
                    stderr=errors,
                    timeout=timeout,
                    check=False,
                )
            except OSError:
                raise TransportError("Could not start the site transport") from None
            except subprocess.TimeoutExpired:
                raise TransportError(
                    f"SSH login to the site did not finish within {timeout} seconds"
                ) from None
            if completed.returncode:
                errors.seek(0)
                raise self.connection_failure(errors.read())

    def check_connection(self, result: CommandResult) -> None:
        if result.exit_code == SSH_CONNECTION_FAILED_EXIT_CODE:
            raise self.connection_failure(result.stderr)

    def connection_failure(self, stderr: bytes) -> TransportError:
        """接続に失敗したときのエラー。siteがログインを拒んだときはLoginRefused。"""
        detail = self.diagnostic(stderr)
        message = f"SSH connection to the site failed: {detail}"
        if any(refusal in detail for refusal in LOGIN_REFUSALS):
            return LoginRefused(message)
        return TransportError(message)

    def close(self) -> None:
        if self.shared_connection and self.control_path.exists():
            self.control("exit")
