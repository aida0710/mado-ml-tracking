"""登録モデルをmlflow.models.evaluateで評価し、結果をMLflowに記録する。

評価の自動実行ルールの中では、workerがMLFLOW_TRACKING_URI、MLFLOW_TRACKING_TOKEN、
MLFLOW_RUN_ID、MMT_MODEL_VERSION_FILEを設定する。そのため``mlflow.start_run()``はJobのRunに
つながり、固定したModelVersionが評価される。Jobの外では``--model-uri models:/NAME@ALIAS``を渡す。

例を単体で完結させるため、正解の行はコードに直接書いている。実際の評価のコードは、代わりに
正解のDatasetを読む。
"""

from __future__ import annotations

import argparse
import json
import os
from pathlib import Path

import mlflow
import pandas as pd
from mlflow.metrics import MetricValue
from mlflow.models import EvaluationResult, make_metric

# y = 2a + 3b + 1の行。scripts/verify_mlflow3.pyが登録する線形モデルに合わせてある。
REFERENCE_ROWS = pd.DataFrame(
    {"a": [0.0, 1.0, 0.0, 2.0], "b": [0.0, 0.0, 1.0, 1.0], "target": [1.0, 3.0, 4.0, 8.0]}
)
TARGET_COLUMN = "target"


def absolute_error(predictions: pd.Series, targets: pd.Series, metrics: dict) -> MetricValue:
    scores = [
        abs(float(prediction) - float(target))
        for prediction, target in zip(predictions, targets, strict=True)
    ]
    return MetricValue(scores=scores, aggregate_results={"mean": sum(scores) / len(scores)})


# 既定のevaluatorは、行ごとのスコアを持つメトリクスがあるときだけeval_results_table.jsonを書く。
ABSOLUTE_ERROR = make_metric(eval_fn=absolute_error, greater_is_better=False, name="absolute_error")


def pinned_model_version() -> tuple[str, str | None]:
    """固定したModelVersionのモデルURIと、その登録元のLogged Modelを返す。"""
    descriptor = json.loads(Path(os.environ["MMT_MODEL_VERSION_FILE"]).read_text())
    model_version = descriptor["modelVersion"]
    logged_model_id = model_version.get("metadata", {}).get("mlflow", {}).get("loggedModelId")
    return f"mlflow-artifacts:/model-versions/{model_version['id']}/artifacts", logged_model_id


def evaluate_model(model_uri: str, *, logged_model_id: str | None = None) -> EvaluationResult:
    """実行中のRunで評価する。Logged ModelのIDがあれば、そのモデルにもメトリクスを記録する。"""
    return mlflow.models.evaluate(
        model_uri,
        REFERENCE_ROWS,
        targets=TARGET_COLUMN,
        model_type="regressor",
        evaluators=["default"],
        extra_metrics=[ABSOLUTE_ERROR],
        model_id=logged_model_id,
    )


def main() -> None:
    parser = argparse.ArgumentParser(description="Evaluate a registered model with mlflow.models.evaluate")
    parser.add_argument("--model-uri", help="models:/NAME@ALIAS etc. Defaults to the Job's pinned version")
    arguments = parser.parse_args()
    if arguments.model_uri:
        model_uri, logged_model_id = arguments.model_uri, None
    else:
        model_uri, logged_model_id = pinned_model_version()
    with mlflow.start_run() as run:
        expected_run_id = os.environ.get("MMT_RUN_ID")
        if expected_run_id and run.info.run_id != expected_run_id:
            raise RuntimeError("mlflow.start_run() did not attach to the Job's Run")
        result = evaluate_model(model_uri, logged_model_id=logged_model_id)
    print(json.dumps({"runId": run.info.run_id, "metrics": result.metrics}, default=float), flush=True)


if __name__ == "__main__":
    main()
