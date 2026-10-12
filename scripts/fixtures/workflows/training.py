"""Read the exact preprocessing output and record a tiny model on CPU."""

import hashlib
import json
import os
from pathlib import Path

import mado_tracking

usage = json.loads(Path(os.environ["MMT_DATASET_USAGE_FILE"]).read_text())["items"]
assert len(usage) == 1 and usage[0]["role"] == "training" and usage[0]["weight"] == 2
assert usage[0]["selection"] == {"seed": 42}
directories = json.loads(os.environ["MMT_INPUT_DATASET_DIRS"])
input_directory = Path(directories[usage[0]["datasetVersionId"]])
# The preprocessing step declared its shard directory; the version holds the shards at its root.
records = [
    record
    for shard in sorted(input_directory.glob("part-*.json"))
    for record in json.loads(shard.read_text())
]
assert records
with mado_tracking.start_run() as run:
    run.log_metrics({"train.records": len(records), "accuracy": 0.875})
weights = json.dumps(
    {"mean_duration": sum(record["duration"] for record in records) / len(records)}
).encode()
output = Path(os.environ["MMT_OUTPUTS_DIR"])
(output / "weights.bin").write_bytes(weights)
(output / "result.json").write_text(
    json.dumps(
        {
            "version": 2,
            "complete": True,
            "artifacts": [
                {
                    "path": "weights.bin",
                    "sha256": hashlib.sha256(weights).hexdigest(),
                    "size": len(weights),
                }
            ],
            "metrics": [],
        }
    )
)
