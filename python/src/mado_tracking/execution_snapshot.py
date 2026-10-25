"""Runに記録された、変更できない実行の指示を解決して検証する。"""

from __future__ import annotations

import copy
from collections.abc import Mapping
from typing import Any, Literal

from .code_source import validate_code_source
from .execution_runtime import validate_entrypoint, validate_runtime

ExecutionMode = Literal["run", "test"]
EXECUTION_MODES = {"run", "test"}


def validate_execution_mode(mode: object) -> None:
    if not isinstance(mode, str) or mode not in EXECUTION_MODES:
        raise ValueError("Run.executionMode must be run or test")


def resolve_execution_snapshot(code_version: Mapping[str, Any], run: Mapping[str, Any]) -> dict[str, Any]:
    mode = run.get("executionMode")
    validate_execution_mode(mode)
    source = code_version["source"]
    validate_code_source(source)
    entrypoint = code_version["entrypoint"]
    if not isinstance(entrypoint, list):
        raise ValueError("CodeVersion.entrypoint must be a nonempty argv")
    validate_entrypoint(entrypoint)
    test_entrypoint = code_version["testEntrypoint"]
    if not isinstance(test_entrypoint, list):
        raise ValueError("CodeVersion.testEntrypoint must be an argv")
    if test_entrypoint:
        validate_entrypoint(test_entrypoint)
    if mode == "test" and not test_entrypoint:
        raise ValueError("Test execution requires a saved CodeVersion.testEntrypoint")
    requirements = code_version["requirements"]
    if not isinstance(requirements, list) or not all(isinstance(item, str) for item in requirements):
        raise ValueError("CodeVersion.requirements must be a list of strings")
    runtime = validate_runtime(code_version.get("runtime"), source=source, requirements=requirements)
    expected = {
        "codeVersionId": code_version["id"],
        "version": code_version["version"],
        "mode": mode,
        "source": source,
        "runtime": runtime,
        "entrypoint": test_entrypoint if mode == "test" else entrypoint,
        "requirements": requirements,
        "environment": code_version["environment"],
    }
    snapshot = run.get("executionSnapshot")
    if not isinstance(snapshot, Mapping) or dict(snapshot) != expected:
        raise ValueError("Run.executionSnapshot does not match its pinned CodeVersion and executionMode")
    if not isinstance(expected["version"], str) or not expected["version"]:
        raise ValueError("ExecutionSnapshot requires a saved CodeVersion version")
    return copy.deepcopy(expected)


def resolve_runner_execution_snapshot(specification: Mapping[str, Any]) -> dict[str, Any]:
    snapshot = resolve_execution_snapshot(specification["codeVersion"], specification["runExecution"])
    if specification.get("executionSnapshot") != snapshot:
        raise ValueError("Runner executionSnapshot does not match the pinned Run instructions")
    return snapshot
