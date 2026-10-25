"""Records the quickstart's Runs in the sample environment, as steps 1 to 5 of the quickstart do.

Creates the quickstart Project and the experiment whisper-small-finetune, issues a one-hour API
token, runs train_sdk.py (Python SDK) and train_mlflow.py (MLflow 3) exactly as the page shows
them, and deletes the token. The IDs go to quickstart-state.json for capture-quickstart.mjs.

    PYTHONPATH=python/src <python> pages/scripts/screenshots/seed_quickstart.py --lang en

The Python needs httpx and mlflow 3 (mlflow-skinny is enough).
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import tempfile
from datetime import UTC, datetime, timedelta
from pathlib import Path

import httpx

from screenshot_environment import REPOSITORY_ROOT, load_environment

# pages/guide/quickstart.mdとpages/en/guide/quickstart.mdの例の値。
PROJECT_NAMES = {"ja": "音声認識の実験", "en": "speech-recognition"}
EXPERIMENT_NAME = "whisper-small-finetune"
# クイックスタートの手順4をそのまま使う。
TRAIN_SDK = """\
import math

from mado_tracking import start_run

with start_run(name="lr-1e-4") as run:
    run.log_params({"learning_rate": 1e-4, "batch_size": 16})
    for step in range(50):
        loss = 2.0 * math.exp(-step / 15) + 0.1
        run.log_metrics({"train.loss": loss}, step=step)
    print("Run:", run.id)
"""
# クイックスタートの手順5をそのまま使う。
TRAIN_MLFLOW = """\
import math

import mlflow

mlflow.set_experiment("whisper-small-finetune")
with mlflow.start_run(run_name="lr-5e-5"):
    mlflow.log_params({"learning_rate": 5e-5, "batch_size": 16})
    for step in range(50):
        mlflow.log_metric("train.loss", 1.8 * math.exp(-step / 20) + 0.15, step=step)
"""
TOKEN_LIFETIME = timedelta(hours=1)


def call(session: httpx.Client, method: str, path: str, **options) -> dict:
    response = session.request(method, path, **options)
    if not response.is_success:
        raise RuntimeError(f"{method} {path}: HTTP {response.status_code} {response.text[:800]}")
    return response.json() if response.content else {}


def run_script(source: str, environment: dict[str, str]) -> None:
    with tempfile.TemporaryDirectory() as directory:
        script = Path(directory) / "train.py"
        script.write_text(source)
        subprocess.run([sys.executable, str(script)], cwd=directory, env=environment, check=True)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--lang", choices=sorted(PROJECT_NAMES), default="ja")
    arguments = parser.parse_args()
    environment = load_environment(arguments.lang, "sample")
    state_file = environment.directory / "quickstart-state.json"
    # 手順ごとに保存し、再実行したときは2つ目のProjectを作らずに続きから進める。
    state = json.loads(state_file.read_text()) if state_file.exists() else {}

    def save() -> None:
        state_file.write_text(json.dumps(state, indent=2) + "\n")

    if state.get("recorded"):
        print(f"already recorded: {state_file}")
        return 0
    api_url, web_url = environment.api_url, environment.web_url
    with httpx.Client(base_url=f"{api_url}/api/", headers={"Origin": web_url}, timeout=60) as session:
        call(session, "POST", "auth/dev-login", json={})
        if "projectId" not in state:
            project = call(
                session,
                "POST",
                "projects",
                json={
                    "name": PROJECT_NAMES[arguments.lang],
                    "visibility": "public",
                    "artifactBackend": "filesystem",
                },
            )
            state["projectId"] = project["id"]
            save()
        project_id = state["projectId"]
        if "experimentId" not in state:
            experiment = call(
                session, "POST", f"projects/{project_id}/experiments", json={"name": EXPERIMENT_NAME}
            )
            state["experimentId"] = experiment["id"]
            save()
        issued = call(
            session,
            "POST",
            "tokens",
            json={
                "name": "laptop-sdk",
                "projectId": project_id,
                "scopes": ["read", "runs:write", "registry:write", "artifacts:write"],
                "expiresAt": (datetime.now(UTC) + TOKEN_LIFETIME).isoformat().replace("+00:00", "Z"),
            },
        )
        try:
            inherited = {
                name: value for name, value in os.environ.items() if not name.startswith(("MMT_", "MLFLOW_"))
            }
            # スクリプトをどこから実行しても、このチェックアウトのSDKを使う。
            inherited["PYTHONPATH"] = str(REPOSITORY_ROOT / "python/src")
            run_script(
                TRAIN_SDK,
                {
                    **inherited,
                    "MMT_API_URL": api_url,
                    "MMT_PROJECT_ID": project_id,
                    "MMT_EXPERIMENT_ID": state["experimentId"],
                    "MMT_API_TOKEN": issued["token"],
                },
            )
            tracking_uri = f"{api_url}/api/mlflow/projects/{project_id}"
            run_script(
                TRAIN_MLFLOW,
                {
                    **inherited,
                    "MLFLOW_TRACKING_URI": tracking_uri,
                    "MLFLOW_REGISTRY_URI": tracking_uri,
                    "MLFLOW_TRACKING_TOKEN": issued["token"],
                },
            )
        finally:
            call(session, "DELETE", f"tokens/{issued['item']['id']}")
    state["recorded"] = True
    save()
    print(f"recorded the quickstart Runs in {project_id}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
