"""TargetCheckResultを送れる形にする。秘密情報を含めず、APIのサイズに収め、バージョン2にする。"""

from __future__ import annotations

from typing import Any

from ..security import SecretMasker
from .reported_text import CONTROL_CHARACTERS, is_one_line_path, json_size, looks_like_secret

# APIの上限と同じ（apps/api/src/domain/targetCheckValidation.ts）。
MAX_DETAIL_LENGTH = 200
# APIのMAX_TARGET_CHECK_RESULT_BYTES。その大半を候補の一覧が占める。
MAX_TARGET_CHECK_RESULT_BYTES = 32 * 1024


def sanitize_text(value: str | None, *, masker: SecretMasker, secret_paths: list[str]) -> str | None:
    """短い1行の事実だけを残す。コンピュータの鍵のファイルを指すものは捨てる。"""
    if value is None:
        return None
    text = CONTROL_CHARACTERS.sub(" ", masker.mask(str(value))).strip()[:MAX_DETAIL_LENGTH]
    if not text or any(path in text for path in secret_paths) or looks_like_secret(text, masker=masker):
        return None
    return text


def sanitize_path(path: str | None, *, masker: SecretMasker, secret_paths: list[str]) -> str | None:
    """パスはそのまま出すか、まったく出さないか。手を加えたパスは別のファイルを指してしまう。"""
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
    machine = result["host"]["machine"]
    # `uname -m`は1語。マスクや切り詰めが必要だったものは、マシンを表さない。
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
    """APIが結果を受け付けるまで、ディレクトリの候補を後ろから捨て、次にPythonを後ろから捨てる。"""
    directories = list(result["directories"])
    pythons = list(result["pythons"])
    fitted = {**result, "directories": directories, "pythons": pythons}
    while json_size(fitted) > MAX_TARGET_CHECK_RESULT_BYTES and directories:
        directories.pop()
    while json_size(fitted) > MAX_TARGET_CHECK_RESULT_BYTES and pythons:
        pythons.pop()
    return fitted
