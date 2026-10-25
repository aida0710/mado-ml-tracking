"""ワークフローのブラウザでの検証に使う、CPUで動く小さな前処理のJob。"""

import hashlib
import json
import os
from pathlib import Path

import mado_tracking

# 前処理した数千の音声ファイルと同じように、出力を1つのディレクトリの下のshardに分け、
# 1つのデータセットバージョンとして宣言する。
SHARD_COUNT = 2

context = json.loads(Path(os.environ["MMT_JOB_CONTEXT_FILE"]).read_text())
usage = json.loads(Path(os.environ["MMT_DATASET_USAGE_FILE"]).read_text())["items"]
assert usage[0]["role"] == "input"
directories = json.loads(os.environ["MMT_INPUT_DATASET_DIRS"])
raw_directory = Path(directories[usage[0]["datasetVersionId"]])
records = json.loads(next(raw_directory.rglob("raw.json")).read_text())
retained = [
    record
    for record in records
    if record["duration"] >= context["parameters"]["minimumDuration"]
]
output = Path(os.environ["MMT_OUTPUTS_DIR"])
(output / "prepared").mkdir()
shards = []
for index in range(SHARD_COUNT):
    content = json.dumps(retained[index::SHARD_COUNT]).encode()
    path = f"prepared/part-{index}.json"
    (output / path).write_bytes(content)
    shards.append(
        {
            "path": path,
            "sha256": hashlib.sha256(content).hexdigest(),
            "size": len(content),
        }
    )
sample = output.parent / "preprocessing-sample.txt"
sample.write_text(json.dumps(retained[0]))
with mado_tracking.start_run() as run:
    artifact = run.log_artifact(sample, path="sample.txt")
    excluded_count = len(records) - len(retained)
    run.log_preprocessing_report(
        input_count=len(records),
        output_count=len(retained),
        excluded_count=excluded_count,
        input_duration_seconds=sum(record["duration"] for record in records),
        output_duration_seconds=sum(record["duration"] for record in retained),
        exclusions=[{"reason": "短い音声", "count": excluded_count}]
        if excluded_count
        else [],
        metrics={"snr_mean": 21.5},
        sample_artifact_ids=[artifact["id"]],
    )
(output / "result.json").write_text(
    json.dumps(
        {
            "version": 2,
            "complete": True,
            "artifacts": shards,
            "metrics": [],
            "datasets": [
                {
                    "datasetId": context["parameters"]["outputDatasetId"],
                    "path": "prepared",
                    # パスでの宣言のdigestは、サーバーがファイルから計算する。
                    "digest": "server-computed",
                }
            ],
        }
    )
)
