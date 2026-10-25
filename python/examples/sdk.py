"""手動でのRunのcontext、メトリクス・ログ・Artifact、学習の出力の明示的な登録。"""

from __future__ import annotations

import json
import os
import tempfile
from pathlib import Path

from mado_tracking import Client


def main() -> None:
    project_id = os.environ["MMT_PROJECT_ID"]
    with Client() as client:
        experiment = client.create_experiment(project_id, name="SDK CPU example")
        with client.start_run(
            project_id=project_id,
            experiment_id=experiment["id"],
            name="manual training",
            kind="training",
            parameters={"learning_rate": 0.1},
        ) as run:
            run.log_params({"epochs": 2})
            run.set_tags({"framework": "stdlib"})
            for step, loss in enumerate([1.0, 0.25]):
                run.log_metrics({"loss": loss}, step=step)
            run.log("Writing model artifact")
            with tempfile.TemporaryDirectory() as directory:
                weights = Path(directory) / "weights.json"
                weights.write_text(json.dumps({"weight": 2.0, "bias": 1.0}))
                artifact = run.log_artifact(weights, path="model/weights.json")
            run.register_output_model(
                model_name=f"sdk-linear-{run.id}", family="linear", version="v1", artifact_id=artifact["id"]
            )


if __name__ == "__main__":
    main()
