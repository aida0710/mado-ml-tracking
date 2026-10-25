"""PATHに置いた偽の`ssh`を相手にしたSshSiteTransport: ログインの回数と共有の接続。

偽のsshは呼び出しをすべて記録する。master（`ControlMaster=yes`）はcontrol socketを作り、
自分が生きている印を付ける。`-O check`と`-O exit`はmasterが生きているあいだだけ応答する。
コマンドは、共有の接続を通って実行したかを報告する。隣に`refusal`ファイルを置くと、すべての
ログインがその文面で失敗する。
"""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path

import pytest

from mado_tracking.errors import TransportError
from mado_tracking.security import SecretMasker
from mado_tracking.site.transport import (
    MAX_CONTROL_PATH_BYTES,
    LoginRefused,
    SshEndpoint,
    SshSiteTransport,
    connections_can_be_shared,
)

FAKE_SSH = r"""
import json
import sys
from pathlib import Path

here = Path(__file__).resolve().parent
arguments = sys.argv[1:]
with (here / "ssh.jsonl").open("a") as log:
    log.write(json.dumps(arguments) + "\n")
options = [arguments[index + 1] for index, value in enumerate(arguments[:-1]) if value == "-o"]
paths = [value.split("=", 1)[1] for value in options if value.startswith("ControlPath=")]
socket = Path(paths[0]) if paths else None
master = here / "master-alive"
shared = socket is not None and socket.exists() and master.exists()
if "-O" in arguments:
    if shared and arguments[arguments.index("-O") + 1] == "exit":
        socket.unlink()
        master.unlink()
    sys.exit(0 if shared else 255)
refusal = here / "refusal"
if refusal.exists():
    sys.stderr.write(refusal.read_text())
    sys.exit(255)
if "ControlMaster=yes" in options:
    socket.write_text("")
    master.write_text("")
    sys.exit(0)
print("shared" if shared else "alone")
"""
REFUSED_KEY = "mmt@login.example.org: Permission denied (publickey).\r\n"
UNKNOWN_HOST_KEY = (
    "No ED25519 host key is known for login.example.org and you have requested strict checking.\r\n"
    "Host key verification failed.\r\n"
)
UNREACHABLE = "ssh: connect to host login.example.org port 22: Connection timed out\r\n"


@pytest.fixture
def fake_ssh(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    directory = tmp_path / "bin"
    directory.mkdir()
    executable = directory / "ssh"
    executable.write_text(f"#!{sys.executable}\n" + FAKE_SSH)
    executable.chmod(0o700)
    monkeypatch.setenv("PATH", f"{directory}:{os.environ.get('PATH', '')}")
    return directory


def calls(fake_ssh: Path) -> list[str]:
    """各sshの呼び出しの種類: master、コマンド、または送った-Oの制御コマンド。"""
    log = fake_ssh / "ssh.jsonl"
    kinds = []
    for line in log.read_text().splitlines() if log.exists() else []:
        argv = json.loads(line)
        if "-O" in argv:
            kinds.append(argv[argv.index("-O") + 1])
        else:
            kinds.append("master" if "ControlMaster=yes" in argv else "command")
    return kinds


def transport_under(tmp_path: Path, state_directory: Path) -> SshSiteTransport:
    key, known_hosts = tmp_path / "key", tmp_path / "known_hosts"
    key.write_text("private")
    key.chmod(0o600)
    known_hosts.write_text("login.example.org ssh-ed25519 AAAA\n")
    endpoint = SshEndpoint(
        host="login.example.org", port=22, user="mmt", identity_file=key, known_hosts=known_hosts
    )
    return SshSiteTransport(endpoint, state_directory=state_directory, masker=SecretMasker())


def test_a_refused_login_fails_once_and_says_that_retrying_cannot_help(
    tmp_path, fake_ssh, ssh_state_directory
):
    transport = transport_under(tmp_path, ssh_state_directory)
    (fake_ssh / "refusal").write_text(REFUSED_KEY)
    with pytest.raises(LoginRefused, match=r"Permission denied \(publickey\)"):
        transport.run(["true"])
    # 失敗したログインはmasterのものだけ。コマンドが自分でもう一度ログインすることはない。
    assert calls(fake_ssh) == ["master"]

    (fake_ssh / "refusal").write_text(UNKNOWN_HOST_KEY)
    with pytest.raises(LoginRefused, match="Host key verification failed"):
        transport.run(["true"])
    # 応答しないホストは、あとで応答するかもしれない。それは拒否ではない。
    (fake_ssh / "refusal").write_text(UNREACHABLE)
    with pytest.raises(TransportError, match="Connection timed out") as unreachable:
        transport.run(["true"])
    assert not isinstance(unreachable.value, LoginRefused)
    assert calls(fake_ssh) == ["master", "master", "master"]


def test_one_login_serves_the_commands_and_a_socket_left_by_a_killed_master_is_replaced(
    tmp_path, fake_ssh, ssh_state_directory
):
    transport = transport_under(tmp_path, ssh_state_directory)
    assert transport.run(["true"]).stdout == b"shared\n"
    assert transport.run(["true"]).stdout == b"shared\n"
    assert calls(fake_ssh) == ["master", "command", "check", "command"]

    # launcherが強制終了されてmasterも終わり、そのsocketがstateディレクトリに残った。
    (fake_ssh / "master-alive").unlink()
    assert transport.control_path.exists()
    assert transport.run(["true"]).stdout == b"shared\n"
    assert calls(fake_ssh)[4:] == ["check", "master", "command"]

    transport.close()
    assert calls(fake_ssh)[-1] == "exit" and not transport.control_path.exists()


def test_under_a_state_directory_too_deep_for_a_control_socket_each_command_logs_in(
    tmp_path, fake_ssh, ssh_state_directory
):
    deep = ssh_state_directory / ("d" * MAX_CONTROL_PATH_BYTES)
    assert connections_can_be_shared(ssh_state_directory) and not connections_can_be_shared(deep)
    transport = transport_under(tmp_path, deep)
    # OpenSSHがsocketをbindできないのでmasterは起動しない。コマンドはそれぞれ単独でログインする。
    assert transport.run(["true"]).stdout == b"alone\n"
    assert transport.run(["true"]).stdout == b"alone\n"
    assert calls(fake_ssh) == ["command", "command"]
    (fake_ssh / "refusal").write_text(REFUSED_KEY)
    with pytest.raises(LoginRefused):
        transport.run(["true"])
    transport.close()
    assert calls(fake_ssh) == ["command", "command", "command"]
