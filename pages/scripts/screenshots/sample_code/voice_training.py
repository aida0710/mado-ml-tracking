"""Sample training Job: fits a linear model (y = 2x + 1), logging metrics every step and audio,
an image and a table along the way.

The weights have the format of training.py, which inference.py reads. They are saved to the
artifactPath of the Task's output model setting, and the Task registers the version. The worker
logs system.*.
"""

from __future__ import annotations

import json
import os
import time
from pathlib import Path

from media_logging import SAMPLE_RATE, TARGET_HZ, evaluation_table, spectrogram, synthesize
from training import EXAMPLES, output_model_of_task

from mado_tracking import start_run

VALIDATION = [(0.5, 2.0), (1.5, 4.0), (-0.5, 0.0)]
# A prediction this close to the answer counts as correct (the definition of accuracy).
ACCURACY_TOLERANCE = 0.05
MEDIA_EVERY = 10
LOWEST_TONE_HZ = 200.0


def mean_squared_error(weight: float, bias: float, pairs: list[tuple[float, float]]) -> float:
    return sum((weight * x + bias - y) ** 2 for x, y in pairs) / len(pairs)


def accuracy(weight: float, bias: float, pairs: list[tuple[float, float]]) -> float:
    return sum(abs(weight * x + bias - y) <= ACCURACY_TOLERANCE for x, y in pairs) / len(pairs)


def main() -> None:
    parameters = json.loads(Path(os.environ["MMT_PARAMETERS_FILE"]).read_text())
    steps = int(parameters.get("steps", 40))
    learning_rate = float(parameters.get("learning_rate", 0.1))
    momentum = float(parameters.get("momentum", 0.5))
    step_seconds = float(parameters.get("step_seconds", 0.5))
    with start_run() as run:
        weight = bias = velocity_weight = velocity_bias = 0.0
        for step in range(steps):
            errors = [weight * x + bias - y for x, y in EXAMPLES]
            loss = sum(error * error for error in errors) / len(EXAMPLES)
            gradient_weight = 2 * sum(error * x for error, (x, _) in zip(errors, EXAMPLES, strict=True))
            gradient_weight /= len(EXAMPLES)
            gradient_bias = 2 * sum(errors) / len(EXAMPLES)
            velocity_weight = momentum * velocity_weight + gradient_weight
            velocity_bias = momentum * velocity_bias + gradient_bias
            weight -= learning_rate * velocity_weight
            bias -= learning_rate * velocity_bias
            val_loss = mean_squared_error(weight, bias, VALIDATION)
            run.log_metrics(
                {
                    "train.loss": loss,
                    "train.accuracy": accuracy(weight, bias, EXAMPLES),
                    "val.loss": val_loss,
                    "val.accuracy": accuracy(weight, bias, VALIDATION),
                    "train.grad_norm": (gradient_weight**2 + gradient_bias**2) ** 0.5,
                    "model.weight": weight,
                    "model.bias": bias,
                },
                step=step,
            )
            if step % MEDIA_EVERY == MEDIA_EVERY - 1 or step == steps - 1:
                # The tone approaches 440 Hz as val.loss falls, so the progress of training can be heard.
                frequency = TARGET_HZ - (TARGET_HZ - LOWEST_TONE_HZ) * min(1.0, val_loss)
                audio = synthesize(frequency, seconds=1.0)
                caption = f"step {step}: {frequency:.1f} Hz"
                run.log_audio("samples/tone", audio, sample_rate=SAMPLE_RATE, caption=caption, step=step)
                run.log_image("samples/spectrogram", spectrogram(audio), caption=caption, step=step)
                run.log_table("eval/samples", evaluation_table(frequency), step=step)
            print(f"step={step} loss={loss:.6f} val_loss={val_loss:.6f}", flush=True)
            time.sleep(step_seconds)
        output = Path("outputs/weights.json")
        output.parent.mkdir(parents=True, exist_ok=True)
        output.write_text(json.dumps({"family": "linear", "weight": weight, "bias": bias, "steps": steps}))
        output_model = output_model_of_task(run)
        if output_model is None:
            raise SystemExit("voice_training.py must run from a Task with an output model setting")
        run.log_artifact(output, path=output_model["artifactPath"], mime_type="application/json")
        print(f"weight={weight:.6f} bias={bias:.6f}; the Task registers {output_model['artifactPath']}", flush=True)


if __name__ == "__main__":
    main()
