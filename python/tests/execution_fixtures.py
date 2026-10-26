"""テストのfixtureで使う、今のAPIが返す形の実行のスナップショット。"""

import copy


def pin_execution(payload, mode=None):
    if mode is None:
        mode = payload["run"].get("executionMode", "run")
    code = payload["codeVersion"]
    payload["run"].update(
        # APIはRunの作成時に、コードバージョンのruntimeをenvironmentへ固定する。
        environment={**payload["run"].get("environment", {}), "runtime": copy.deepcopy(code["runtime"])},
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
