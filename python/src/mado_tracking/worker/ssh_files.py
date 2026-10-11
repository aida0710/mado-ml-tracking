"""Find the files on the worker's host a computer's SSH key and known_hosts paths may name.

Only names and modes are looked at. A file's contents are never read, so nothing about a key
leaves the host but its path.
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

# Where the worker's keys are when ~/.ssh is not (a worker started outside docker compose, which
# mounts them at ~/.ssh).
SSH_DIRECTORY_VARIABLE = "MMT_WORKER_SSH_DIR"
# MAX_WORKER_SSH_FILE_PATHS of the API; far more than a worker's ~/.ssh holds.
MAX_WORKER_SSH_FILE_PATHS = 50
KNOWN_HOSTS_PREFIX = "known_hosts"
# Files ssh keeps beside the keys that are never keys themselves.
NOT_KEY_NAMES = frozenset({"config", "environment", "rc"})
NOT_KEY_PREFIXES = ("authorized_keys", KNOWN_HOSTS_PREFIX)
PUBLIC_KEY_SUFFIX = ".pub"
# Names people give private keys. A file with another name counts when only its owner can read
# it, the mode ssh itself demands of a private key.
KEY_NAME_PATTERNS = ("id_*", "*.pem", "*.key")


@dataclass(frozen=True)
class WorkerSshFiles:
    key_paths: tuple[str, ...] = ()
    known_hosts_paths: tuple[str, ...] = ()

    def to_payload(self) -> dict[str, list[str]]:
        """WorkerSshFiles of the contract."""
        return {"keyPaths": list(self.key_paths), "knownHostsPaths": list(self.known_hosts_paths)}


def default_ssh_directories(environment: Mapping[str, str] = os.environ) -> tuple[Path, ...]:
    directories = [Path.home() / ".ssh"]
    configured = environment.get(SSH_DIRECTORY_VARIABLE, "").strip()
    if configured:
        directories.append(Path(configured).expanduser())
    return tuple(directories)


def find_ssh_files(directories: Iterable[Path]) -> WorkerSshFiles:
    """Key and known_hosts candidates directly in `directories`, as sorted absolute paths."""
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
    """Names and modes of the regular files in `directory` (a symlink counts by its target)."""
    try:
        with os.scandir(directory) as entries:
            found = []
            for entry in entries:
                try:
                    mode = entry.stat().st_mode
                except OSError:
                    # A broken symlink or a file removed while listing.
                    continue
                if stat.S_ISREG(mode):
                    found.append((entry.name, mode))
            return found
    except OSError:
        # Missing, not a directory, or not readable by the worker: it offers nothing from there.
        return []


def is_private_key_candidate(name: str, mode: int) -> bool:
    if name.endswith(PUBLIC_KEY_SUFFIX) or name in NOT_KEY_NAMES or name.startswith(NOT_KEY_PREFIXES):
        return False
    return any(fnmatchcase(name, pattern) for pattern in KEY_NAME_PATTERNS) or not (
        mode & GROUP_OR_OTHER_ACCESS_BITS
    )
