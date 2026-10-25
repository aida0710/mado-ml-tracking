"""コンピュータのSSHの鍵とknown_hostsのパスが指し得る、workerのホスト上のファイルを探す。

見るのは名前とモードだけ。ファイルの中身は読まないので、
鍵についてはパス以外の何もホストの外に出ない。
"""

from __future__ import annotations

import os
import stat
from collections.abc import Iterable, Mapping
from dataclasses import dataclass
from fnmatch import fnmatchcase
from pathlib import Path

from .doctor import GROUP_OR_OTHER_ACCESS_BITS
from .reported_text import is_one_line_path

# ~/.sshに無いときのworkerの鍵の場所（docker composeの外で
# 起動したworkerの場合。composeは鍵を~/.sshにマウントする）。
SSH_DIRECTORY_VARIABLE = "MMT_WORKER_SSH_DIR"
# APIのMAX_WORKER_SSH_FILE_PATHS。workerの~/.sshにあるファイルの数よりずっと多い。
MAX_WORKER_SSH_FILE_PATHS = 50
KNOWN_HOSTS_PREFIX = "known_hosts"
# sshが鍵の横に置くが、それ自体は鍵ではないファイル。
NOT_KEY_NAMES = frozenset({"config", "environment", "rc"})
NOT_KEY_PREFIXES = ("authorized_keys", KNOWN_HOSTS_PREFIX)
PUBLIC_KEY_SUFFIX = ".pub"
# 秘密鍵によく付けられる名前。それ以外の名前のファイルは、
# 所有者だけが読める場合に数える。これはssh自身が秘密鍵に求めるモード。
KEY_NAME_PATTERNS = ("id_*", "*.pem", "*.key")


@dataclass(frozen=True)
class WorkerSshFiles:
    key_paths: tuple[str, ...] = ()
    known_hosts_paths: tuple[str, ...] = ()

    def to_payload(self) -> dict[str, list[str]]:
        """契約のWorkerSshFiles。"""
        return {"keyPaths": list(self.key_paths), "knownHostsPaths": list(self.known_hosts_paths)}


def default_ssh_directories(environment: Mapping[str, str] = os.environ) -> tuple[Path, ...]:
    directories = [Path.home() / ".ssh"]
    configured = environment.get(SSH_DIRECTORY_VARIABLE, "").strip()
    if configured:
        directories.append(Path(configured).expanduser())
    return tuple(directories)


def find_ssh_files(directories: Iterable[Path]) -> WorkerSshFiles:
    """`directories`の直下にある鍵とknown_hostsの候補を、並べ替えた絶対パスで返す。"""
    key_paths: set[str] = set()
    known_hosts_paths: set[str] = set()
    for directory in directories:
        for name, mode in regular_files(directory):
            path = os.path.join(os.path.abspath(directory), name)
            if not is_one_line_path(path):
                continue
            if name.startswith(KNOWN_HOSTS_PREFIX):
                known_hosts_paths.add(path)
            elif is_private_key_candidate(name, mode):
                key_paths.add(path)
    return WorkerSshFiles(
        key_paths=tuple(sorted(key_paths)[:MAX_WORKER_SSH_FILE_PATHS]),
        known_hosts_paths=tuple(sorted(known_hosts_paths)[:MAX_WORKER_SSH_FILE_PATHS]),
    )


def regular_files(directory: Path) -> list[tuple[str, int]]:
    """`directory`にある通常のファイルの名前とモード（symlinkはリンク先で判断する）。"""
    try:
        with os.scandir(directory) as entries:
            found = []
            for entry in entries:
                try:
                    mode = entry.stat().st_mode
                except OSError:
                    # 壊れたsymlinkか、一覧を取っている間に削除されたファイル。
                    continue
                if stat.S_ISREG(mode):
                    found.append((entry.name, mode))
            return found
    except OSError:
        # 無い、ディレクトリでない、またはworkerが読めない。そこからは何も出さない。
        return []


def is_private_key_candidate(name: str, mode: int) -> bool:
    if name.endswith(PUBLIC_KEY_SUFFIX) or name in NOT_KEY_NAMES or name.startswith(NOT_KEY_PREFIXES):
        return False
    return any(fnmatchcase(name, pattern) for pattern in KEY_NAME_PATTERNS) or not (
        mode & GROUP_OR_OTHER_ACCESS_BITS
    )
