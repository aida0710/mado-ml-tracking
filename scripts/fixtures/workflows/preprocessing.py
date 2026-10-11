"""Small CPU preprocessing job used by the workflow browser verification."""

import hashlib
import json
import os
from pathlib import Path

import mado_tracking

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
prepared = output / "prepared.json"
prepared.write_text(json.dumps(retained))
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
content = prepared.read_bytes()
digest = hashlib.sha256(content).hexdigest()
(output / "result.json").write_text(
    json.dumps(
        {
            "version": 2,
            "complete": True,
            "artifacts": [
                {"path": "prepared.json", "sha256": digest, "size": len(content)}
            ],
            "metrics": [],
            "datasets": [
                {
                    "datasetId": context["parameters"]["outputDatasetId"],
                    "path": "prepared.json",
                    "digest": digest,
                }
            ],
        }
    )
)
