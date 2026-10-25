"""評価が新しく登録したモデルを受け取ることを確かめる。"""

import json
import os
from pathlib import Path

import mado_tracking

assert os.environ["MMT_MODEL_VERSION_ID"]
with mado_tracking.start_run() as run:
    weights_path = run.download_input_model(
        Path(os.environ["MMT_OUTPUTS_DIR"]).parent / "input-model.json"
    )
    weights = json.loads(weights_path.read_text())
    assert weights["mean_duration"] > 0
    run.log_metrics({"evaluation.score": 0.9})
