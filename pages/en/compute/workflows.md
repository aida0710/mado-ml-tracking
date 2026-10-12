---
title: Run preprocessing, training and evaluation in order (Workflows)
description: The Workflows page, which runs preprocessing, training and evaluation tasks in order with the settings pinned when saved. How to open it, build a workflow, record quality, and start, stop and resume executions, and who can do each.
---

# Run preprocessing, training and evaluation in order

Workflows run a sequence of tasks with pinned settings and dataset versions. Their history records which data was processed, under which conditions, and which outputs were used for training.

Mado Data Catalog manages data origins, processing history and storage locations. ML Tracking records execution conditions, quality and training usage. Both refer to the same dataset versions.

## Open the page

Open **Workflows** under Execution in the left sidebar. Choose a workflow's name in the list to open its page.

A workflow's page shows, from the top:

- The version choice and **Start workflow**. The newest 20 versions can be chosen; **Load older versions** adds the earlier ones.
- The steps of the chosen version (task, inputs, conditions to continue)
- The execution history: the execution to show and another one to compare it with. Turning to **Older executions** keeps the shown execution.
- Each step of the shown execution: its status, links to its run and job, its preprocessing report and its output versions

On the **Details** tab of a run a workflow created, **Open workflow** goes back to the execution that created it.

## Create a workflow

1. Configure code, parameters and execution computers in [Tasks](/en/models/tasks).
2. Open Workflows, choose **Create workflow**, and add tasks in execution order.
3. Select a pinned dataset version for the first input. Select the preprocessing step's outputs as training inputs.
4. Choose each input's usage, such as training, validation or test. Add mixing weights and selection conditions when needed. A weight is a number greater than 0.
5. Save quality conditions. For example, `preprocessing.retained_input_ratio ≥ 0.9` continues only when at least 90% of inputs remain.

When the workflow cannot be saved, the message names the place and the reason, such as “Step 2, input 1: Choose a dataset version.” Changing a step's key also changes the later steps that take their input or model from it. A field whose source step is gone (for example after removing a step) says “The earlier step … is not there”; choose another one. Removing a step and closing without saving both ask first.

Later task edits do not change saved workflow versions. Create a new version with **Create new version** to change conditions. The execution code must read and apply mixing weights and selection conditions; Workflows do not sample data automatically.

## Start an execution

Select a version and choose **Start workflow**. A confirmation names the workflow and the version. **Start** starts each step's task as a job, in order, with that version's settings, and the page says “Started execution …”. If the confirmation fails and you choose **Start** again, the first start is returned when it was accepted, so two executions are not started.

Only workers that support workflows (a newer mado-tracking) take workflow jobs. When the worker for the computer is older, the job stays queued and its details on the [Jobs page](/en/compute/jobs) say that the worker takes it once updated. See [Install a worker](/en/compute/worker) to update it.

## Record quality

Use the processing run's **Details** tab or Python's `Run.log_preprocessing_report()` to record input, output, excluded and failed counts and durations. Reports can include reason breakdowns, custom quality metrics and sample artifacts. Reports become fixed when the run ends.

Execution history shows each step's report and actual input/output versions. Select another execution to compare corresponding quality values and training results.

## Recover from failure or stop an execution

Missing outputs or unsuccessful quality conditions stop subsequent steps and record the reason.

A failed or canceled execution shows **Resume in a new execution**. After the confirmation, **Resume** starts a new execution that reuses the runs and outputs of the completed steps and starts from the first incomplete step. The original execution stays in the history. To change conditions, create a new version and start from the beginning.

To stop a running execution, choose **Stop workflow**. The confirmation names the execution, its version and its creator. **Stop** asks the running job to stop and starts no further steps. The status is “Stop requested” until the job stops, then “Canceled”.

A job of a workflow step cannot be rerun on its own from the Jobs page. Its actions column shows **Resume from the workflow**, which opens the execution's page.

For a manually submitted site, each job waits until it is [submitted to the site](/en/compute/sites).

## Permissions

| Action | Required permission |
| --- | --- |
| View workflows, versions and the execution history | viewer or higher |
| Create a workflow or a new version | editor or higher (`registry:write` for API tokens) |
| Start an execution | editor or higher (`runs:write` and `jobs:write` for API tokens) |
| Stop an execution, or resume it in a new one | The creator of the execution (editor or higher) or a Project admin (`runs:write` and `jobs:write` for API tokens) |

Editors viewing an execution someone else started see “Only the execution's creator or a project administrator can stop or resume” instead of the stop and resume buttons.
