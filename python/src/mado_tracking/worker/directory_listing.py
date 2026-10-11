"""Read one directory of a computer for the Web, which completes paths while a person types them.

One fixed POSIX sh script (posix_script.py) reads it. The path is an argument and never part of
the script, so nothing typed in the Web runs as a command on the computer.
"""

from __future__ import annotations

from typing import Any

from ..errors import ConfigurationError, TransportError
from ..security import SecretMasker
from .posix_script import run_posix_script, terminated_tokens
from .reported_text import (
    CONTROL_CHARACTERS,
    is_one_line_path,
    javascript_length,
    json_size,
    looks_like_secret,
)
from .transport import create_target_transport

# The API's limits (apps/api/src/domain/targetCheckValidation.ts).
MAX_DIRECTORY_LISTING_ENTRIES = 200
# NAME_MAX of Linux file systems.
MAX_DIRECTORY_ENTRY_NAME_LENGTH = 255
MAX_DIRECTORY_LISTING_RESULT_BYTES = 64 * 1024
# A person waits for it while typing, and the API gives up 60 seconds after the claim.
DIRECTORY_LISTING_TIMEOUT_SECONDS = 20.0
# What the computer could tell about the directory; `unreachable` is the worker's own.
LISTED_OUTCOMES = frozenset({"ok", "missing", "not_directory", "denied"})
UNREACHABLE = "unreachable"
ENTRY_KINDS = {"d": "directory", "f": "file"}
EXECUTABLE_FLAGS = {"1": True, "0": False}
ENTRY_FIELD_COUNT = 3
NOT_ENTRY_NAMES = frozenset({".", ".."})

# Arguments: the directory (absolute, ~ or ~/...), the most entries to print. Output:
# NUL-terminated tokens, the outcome (ok, missing, not_directory, denied) and the directory with ~
# expanded, then per entry its kind (d: directory, also through a symlink; f: anything else),
# whether the user may execute it (1/0) and its name. Hidden entries are listed too.
LISTING_SCRIPT = r"""
main() {
    directory=$1
    limit=$2
    case $directory in
        "~") directory=$HOME ;;
        "~/"*) directory=$HOME/${directory#"~/"} ;;
    esac
    if [ ! -d "$directory" ]; then
        if [ -e "$directory" ]; then outcome=not_directory; else outcome=missing; fi
        printf '%s\000' "$outcome" "$directory"
        return 0
    fi
    if [ ! -r "$directory" ] || [ ! -x "$directory" ]; then
        printf '%s\000' denied "$directory"
        return 0
    fi
    printf '%s\000' ok "$directory"
    count=0
    for entry in "$directory"/* "$directory"/.[!.]* "$directory"/..?*; do
        # A pattern that matched nothing stays as written.
        [ -e "$entry" ] || [ -L "$entry" ] || continue
        [ "$count" -lt "$limit" ] || break
        count=$((count + 1))
        if [ -d "$entry" ]; then
            kind=d
            executable=0
        else
            kind=f
            if [ -x "$entry" ]; then executable=1; else executable=0; fi
        fi
        printf '%s\000' "$kind" "$executable" "${entry##*/}"
    done
    return 0
}
main "$@" </dev/null
"""


def unreachable_result(requested_path: str) -> dict[str, Any]:
    return {"path": requested_path, "outcome": UNREACHABLE, "entries": [], "truncated": False}


def is_reportable_name(name: str, *, masker: SecretMasker) -> bool:
    return (
        0 < javascript_length(name) <= MAX_DIRECTORY_ENTRY_NAME_LENGTH
        and not CONTROL_CHARACTERS.search(name)
        and "/" not in name
        and name not in NOT_ENTRY_NAMES
        and not looks_like_secret(name, masker=masker)
    )


def parse_entry(fields: list[bytes], *, masker: SecretMasker) -> dict[str, Any] | None:
    kind_flag, executable_flag = (field.decode(errors="replace") for field in fields[:2])
    try:
        name = fields[2].decode()
    except UnicodeDecodeError:
        # A name that is not UTF-8 could not be typed back into the Web.
        return None
    if kind_flag not in ENTRY_KINDS or executable_flag not in EXECUTABLE_FLAGS:
        return None
    if not is_reportable_name(name, masker=masker):
        return None
    return {"name": name, "kind": ENTRY_KINDS[kind_flag], "executable": EXECUTABLE_FLAGS[executable_flag]}


def parse_listing_output(raw: bytes, *, requested_path: str, masker: SecretMasker) -> dict[str, Any] | None:
    """A TargetDirectoryListingResult; None when the output is not the script's."""
    tokens = terminated_tokens(raw)
    outcome = tokens[0].decode(errors="replace") if tokens else None
    if len(tokens) < 2 or outcome not in LISTED_OUTCOMES:
        return None
    try:
        listed_path = tokens[1].decode()
    except UnicodeDecodeError:
        listed_path = requested_path
    if not is_one_line_path(listed_path) or looks_like_secret(listed_path, masker=masker):
        listed_path = requested_path
    entry_tokens = tokens[2:]
    listed_count = len(entry_tokens) // ENTRY_FIELD_COUNT
    entries = []
    for index in range(min(listed_count, MAX_DIRECTORY_LISTING_ENTRIES)):
        start = index * ENTRY_FIELD_COUNT
        entry = parse_entry(entry_tokens[start : start + ENTRY_FIELD_COUNT], masker=masker)
        if entry is not None:
            entries.append(entry)
    result = {
        "path": listed_path,
        "outcome": outcome,
        "entries": entries,
        "truncated": listed_count > MAX_DIRECTORY_LISTING_ENTRIES,
    }
    while json_size(result) > MAX_DIRECTORY_LISTING_RESULT_BYTES and entries:
        entries.pop()
        result["truncated"] = True
    return result


async def list_directory(
    target: dict[str, Any], directory_path: str, *, allow_local_executor: bool, masker: SecretMasker
) -> tuple[str, dict[str, Any]]:
    """Return the completion status and result; `failed` means the worker could not read the computer."""
    try:
        transport = create_target_transport(target, allow_local_executor=allow_local_executor, masker=masker)
        raw = await run_posix_script(
            transport,
            LISTING_SCRIPT,
            # One more than is listed, so a larger directory is known to be truncated.
            [directory_path, str(MAX_DIRECTORY_LISTING_ENTRIES + 1)],
            timeout=DIRECTORY_LISTING_TIMEOUT_SECONDS,
        )
    except (ConfigurationError, TransportError, TimeoutError):
        # Missing key files on the worker host, or the computer did not answer in time. ssh's error
        # text can name key paths, so only the outcome is reported.
        return "failed", unreachable_result(directory_path)
    result = parse_listing_output(raw, requested_path=directory_path, masker=masker)
    if result is None:
        return "failed", unreachable_result(directory_path)
    return "finished", result
