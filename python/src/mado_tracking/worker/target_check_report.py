"""Make a TargetCheckResult fit to send: no secrets, within the API's size, in the version it takes."""

from __future__ import annotations

from typing import Any

from ..security import SecretMasker
from .reported_text import CONTROL_CHARACTERS, is_one_line_path, json_size, looks_like_secret
from .target_check_claims import RESULT_VERSION_BEFORE_SETUP

# Matches the API's limit (apps/api/src/domain/targetCheckValidation.ts).
MAX_DETAIL_LENGTH = 200
# MAX_TARGET_CHECK_RESULT_BYTES of the API; the candidate lists take most of it.
MAX_TARGET_CHECK_RESULT_BYTES = 32 * 1024
# What version 2 adds to version 1.
SETUP_FIELDS = ("host", "pythons", "directories")


def sanitize_text(value: str | None, *, masker: SecretMasker, secret_paths: list[str]) -> str | None:
    """Keep a short single-line fact; drop anything that names the target's key files."""
    if value is None:
        return None
    text = CONTROL_CHARACTERS.sub(" ", masker.mask(str(value))).strip()[:MAX_DETAIL_LENGTH]
    if not text or any(path in text for path in secret_paths) or looks_like_secret(text, masker=masker):
        return None
    return text


def sanitize_path(path: str | None, *, masker: SecretMasker, secret_paths: list[str]) -> str | None:
    """A path is offered unchanged or not at all: an edited path would name another file."""
    if (
        path is None
        or not is_one_line_path(path)
        or looks_like_secret(path, masker=masker)
        or any(secret in path for secret in secret_paths)
    ):
        return None
    return path


def sanitize_result(
    result: dict[str, Any], *, target: dict[str, Any], masker: SecretMasker
) -> dict[str, Any]:
    secret_paths = [path for path in (target.get("sshKeyPath"), target.get("knownHostsPath")) if path]

    def clean(value: str | None) -> str | None:
        return sanitize_text(value, masker=masker, secret_paths=secret_paths)

    def clean_path(value: str | None) -> str | None:
        return sanitize_path(value, masker=masker, secret_paths=secret_paths)

    items = [{**entry, "detail": clean(entry["detail"])} for entry in result["items"]]
    gpus = result["gpus"]
    if gpus is not None:
        gpus = [
            {**gpu, "uuid": uuid, "name": name}
            for gpu in gpus
            if (uuid := clean(gpu["uuid"])) is not None and (name := clean(gpu["name"])) is not None
        ]
    sanitized = {**result, "items": items, "gpus": gpus}
    if "host" not in result:
        return sanitized
    machine = result["host"]["machine"]
    # `uname -m` is one word; one that had to be masked or cut names no machine.
    if machine is not None and clean(machine) != machine:
        machine = None
    return {
        **sanitized,
        "host": {
            **result["host"],
            "machine": machine,
            "cpuArch": result["host"]["cpuArch"] if machine is not None else None,
            "homeDirectory": clean_path(result["host"]["homeDirectory"]),
        },
        "pythons": [python for python in result["pythons"] if clean_path(python["path"]) is not None],
        "directories": [
            directory for directory in result["directories"] if clean_path(directory["path"]) is not None
        ],
    }


def fit_result_size(result: dict[str, Any]) -> dict[str, Any]:
    """Drop the last directory candidates, then the last Pythons, until the API takes the result."""
    if "host" not in result:
        return result
    directories = list(result["directories"])
    pythons = list(result["pythons"])
    fitted = {**result, "directories": directories, "pythons": pythons}
    while json_size(fitted) > MAX_TARGET_CHECK_RESULT_BYTES and directories:
        directories.pop()
    while json_size(fitted) > MAX_TARGET_CHECK_RESULT_BYTES and pythons:
        pythons.pop()
    return fitted


def as_result_version(result: dict[str, Any], version: int) -> dict[str, Any]:
    """An API from before computer setup takes only version 1, which has no setup candidates."""
    if version != RESULT_VERSION_BEFORE_SETUP:
        return result
    return {
        **{key: value for key, value in result.items() if key not in SETUP_FIELDS},
        "version": RESULT_VERSION_BEFORE_SETUP,
    }
