"""実行が始まってから自分のファイルを書き換える、小さなtrackingのワークロード。"""

from __future__ import annotations

import json
from pathlib import Path

VERSION = 1
# 数点あれば、ブラウザでnativeのメトリクスの履歴が見える。
DEMO_STEPS = 5


def main() -> None:
    from mado_tracking import start_run

    with start_run(kind="processing") as run:
        print(f"executed_code_version={VERSION}", flush=True)
        for step in range(DEMO_STEPS):
            run.log_metrics({"demo.loss": VERSION / (step + 1)}, step=step)
        output = Path("outputs/prediction.json")
        output.parent.mkdir(parents=True, exist_ok=True)
        output.write_text(
            json.dumps({"codeVersion": VERSION, "prediction": VERSION * 3})
        )
        run.log_artifact(
            output, path="results/prediction.json", mime_type="application/json"
        )
    # ワークロードが自分を書き換えても、保存したソースは起動したときの内容でなければならない。
    Path(__file__).write_text("# modified during execution\n", encoding="utf-8")


if __name__ == "__main__":
    main()
