"""Execution snapshots supplied by the current API in test fixtures."""

import copy


def pin_execution(payload, mode=None):
    if mode is None:
        mode = payload["run"].get("executionMode", "run")
    code = payload["codeVersion"]
    payload["run"].update(
        runtime=copy.deepcopy(code["runtime"]),
        executionMode=mode,
        executionSnapshot=copy.deepcopy(
            {
                "codeVersionId": code["id"],
                "version": code["version"],
                "mode": mode,
                "source": code["source"],
                "runtime": code["runtime"],
                "entrypoint": code["testEntrypoint"] if mode == "test" else code["entrypoint"],
                "requirements": code["requirements"],
                "environment": code["environment"],
            }
        ),
    )
    return payload
