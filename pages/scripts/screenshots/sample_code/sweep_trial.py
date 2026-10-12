"""A Sweep trial: runs sweep_training.py as is, pausing every epoch so hyperband can compare trials."""

import time

import sweep_training

from mado_tracking import start_run
from mado_tracking.sweeps import trial_parameters

# The API decides hyperband every 15 seconds; the pause lets it compare trials at the same epoch.
EPOCH_SECONDS = 3


class PacedRun:
    def __init__(self, run):
        self.run = run

    def log_metrics(self, metrics, *, step):
        self.run.log_metrics(metrics, step=step)
        time.sleep(EPOCH_SECONDS)


parameters = trial_parameters(sweep_training.DEFAULT_PARAMETERS)
with start_run() as run:
    sweep_training.train(
        lr=float(parameters["lr"]),
        batch_size=int(parameters["batch_size"]),
        epochs=int(parameters["epochs"]),
        run=PacedRun(run),
    )
