---
title: Continue training and add data
description: Record data added during pretraining and continue from checkpoints as new runs.
---

# Continue training and add data

When a long training stops, you can continue from a saved checkpoint as a new Run. The original Run is not changed and stays as the record of the failure or cancellation. Resuming is manual; automatic retries of automation rules start from the beginning.

## Record data added during pretraining {#training-data-stages}

When you add data without changing runs, open **Training data history** and choose **Record data change**. Enter the first step using the new configuration and select every dataset version still used from that step. The history shows initial inputs, additions and removals without rewriting the original run configuration.

Training code can record the same change after updating its loader:

```python
run.log_training_data_stage(
    start_step=1001,
    input_dataset_version_ids=[original_dataset_version_id, synthetic_dataset_version_id],
    checkpoint_id=checkpoint["id"],  # This run's checkpoint at step 1000; optional.
    metadata={"note": "Synthetic data added during pretraining"},
)
```

Include retained datasets as well as additions. Recorded steps and versions are fixed; identical resends return the same record. New records cannot be added after a job finishes. This method needs an online connection and does not change the running loader itself.

## Continue training with a different data configuration

A completed training run's checkpoint can start a new run, including checkpoints recorded without a job.

1. Open the run's **Checkpoint** tab and choose **Continue training with these weights**.
2. Review the datasets used at that checkpoint and add the exact versions needed for the next stage.
3. Review the training configuration and computer, then choose **Launch job**.

The new run pins its original run, checkpoint and new dataset configuration. It keeps the original kind, so pretraining continues as training. You may select another version of the same code. Training code loads the weights with `run.resume_checkpoint()`.

## When to use it

- A training of several hours stopped because the GPU machine rebooted or ran out of memory
- You canceled a training and want to continue later with the same parameters
- You want the Run to record which checkpoint it continued from

## Save checkpoints from training code

Save a directory with `run.log_checkpoint()` in the Python SDK. In a resumed Run, `run.resume_checkpoint()` returns where to continue from.

```python
from mado_tracking import start_run

TOTAL_STEPS = 1000
CHECKPOINT_EVERY = 100

with start_run(kind="training", parameters={"steps": TOTAL_STEPS}) as run:
    checkpoint = run.resume_checkpoint()  # None unless resuming
    if checkpoint is not None:
        state = load(checkpoint.path)  # a read-only directory
        start_step = checkpoint.step
    else:
        state, start_step = initial_state(), 0
    for step in range(start_step, TOTAL_STEPS):
        loss = train_one_step(state)
        run.log_metrics({"train.loss": loss}, step=step)
        if (step + 1) % CHECKPOINT_EVERY == 0:
            save(state, "ckpt")  # weights, optimizer state, RNG state, ...
            run.log_checkpoint("ckpt", step=step + 1, includes_optimizer=True, framework="torch")
```

- `log_checkpoint()` packs the directory into one tar, uploads it as the Run Artifact `checkpoints/step-<step>.tar`, and registers the path, SHA-256, and size of each file.
- Use the number of completed steps as `step`, so the resumed code can continue with `range(checkpoint.step, TOTAL_STEPS)`.
- Keep logging metrics with continuing step numbers after resuming. Not restarting from 0 keeps the chart as one line.
- Directories containing symbolic links and empty directories are rejected. Saving the same step twice in a Run is rejected.

Files the MLflow 3 SDK saves under `checkpoints/step-<integer>/`, for example with `mlflow.log_artifacts("ckpt", "checkpoints/step-100")`, also become checkpoints in training and fine-tuning Runs.

## See saved checkpoints

The **Checkpoint** tab of a Run lists its checkpoints with the step, number of files, whether the optimizer state is included, and the framework.

The list shows the newest five per Run (`MMT_CHECKPOINT_KEEP_COUNT` on the API server). Check **Include checkpoints outside the retention limit** to see the rest. Checkpoints outside the list keep their Artifacts and can still be resumed from.

## Resume

You can resume a Run that ran as a Job and failed or was canceled. Resuming retries that Job, so only the Run's creator and Project Admins can (as with stopping or retrying a Job). Other people see the reason on the **Checkpoint** tab instead of **Resume from this checkpoint**.

### Resume from a chosen checkpoint

1. Open the stopped Run and select the **Checkpoint** tab.
2. Press **Resume from this checkpoint** on the checkpoint's row.
3. The confirmation says that training resumes from step N as a new Run. Press **Resume as a new run**.
4. Check that a new Run was created and that its Job appears in Jobs with the **Resumed** badge.

### Resume from the latest checkpoint

In Jobs, press **Resume from latest checkpoint** on a failed or canceled Job to resume from the checkpoint with the highest step of that Run. If the Run has no checkpoint but was itself resumed, its resume checkpoint is used.

### Conditions

- The checkpoint belongs to the same Project
- Same run kind as the original Run (training or fine-tuning)
- Same code as the original Run; the code version may differ

The new Run records the checkpoint it resumed from and the original Run as its parent. These cannot change after the Job is created.

## What the worker does

Before starting the code, the worker fetches and checks the checkpoint.

1. It downloads the checkpoint Artifacts and checks their SHA-256 and size, resuming downloads after disconnects.
2. It checks that the tar matches the registered file list exactly. Extra or missing files, `..`, or symbolic links stop the Job.
3. It extracts the files read-only in the target's working directory.
4. It passes these variables to the code:

| Variable | Contents |
| --- | --- |
| `MMT_RESUME_CHECKPOINT_DIR` | The extracted directory; `/mmt/inputs/checkpoint` in containers |
| `MMT_RESUME_STEP` | The step to continue from |
| `MMT_RESUME_CHECKPOINT_FILE` | Path of `resume-checkpoint.json` describing the checkpoint |

If a check fails, the code is not started and the Job fails with an error such as `Checkpoint ... mismatch`.

## Try a failure and resume locally

`python/examples/training.py` in the repository fails at `--fail-at-step` and can resume from a checkpoint, without an API. Create the venv as described in [Install the worker](/en/compute/worker#install-the-worker), then run from the repository root:

```bash
python/.venv/bin/python python/examples/training.py --offline --steps 40 --checkpoint-every 10 \
  --fail-at-step 27 --output /tmp/mmt-ckpt/weights.json
echo '{"checkpointId":"local","sourceRunId":"local","step":20}' > /tmp/mmt-ckpt/resume.json
MMT_RESUME_CHECKPOINT_DIR=/tmp/mmt-ckpt/checkpoints/step-20 MMT_RESUME_STEP=20 \
MMT_RESUME_CHECKPOINT_FILE=/tmp/mmt-ckpt/resume.json \
  python/.venv/bin/python python/examples/training.py --offline --steps 40 --checkpoint-every 10 \
  --output /tmp/mmt-ckpt/resumed.json
```

The first command fails at step 27 and leaves `step-10` and `step-20` in `/tmp/mmt-ckpt/checkpoints/`. The second continues from step 20 to the end.

## Checkpoint storage

Checkpoint Artifacts are never deleted automatically, even after they leave the list. To free space, delete unneeded checkpoint Artifacts ([Artifacts](/en/data/artifacts)). Only Project admins can delete them, and Artifacts of listed checkpoints (within the keep count) and of checkpoints used to resume cannot be deleted.
