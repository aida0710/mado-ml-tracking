# Run preprocessing, training and evaluation in order

Workflows run a sequence of Tasks with pinned settings and dataset versions. Their history records which data was processed, under which conditions, and which outputs were used for training.

Mado Data Catalog manages data origins, processing history and storage locations. ML Tracking records execution conditions, quality and training usage. Both refer to the same dataset versions.

## Create a workflow

1. Configure code, parameters and execution targets in [Tasks](/en/models/tasks).
2. Open Workflows, choose **Create workflow**, and add Tasks in execution order.
3. Select a pinned dataset version for the first input. Select the preprocessing step's outputs as training inputs.
4. Choose each input's usage, such as training, validation or test. Add mixing weights and selection conditions when needed.
5. Save quality conditions. For example, `preprocessing.retained_input_ratio ≥ 0.9` continues only when at least 90% of inputs remain.
6. Select a version and choose **Start workflow**.

Later Task edits do not change saved workflow versions. Create a new version to change conditions. The execution code must read and apply mixing weights and selection conditions; Workflows do not sample data automatically.

## Record quality

Use the processing Run's **Details** tab or Python's `Run.log_preprocessing_report()` to record input, output, excluded and failed counts and durations. Reports can include reason breakdowns, custom quality metrics and sample artifacts. Reports become fixed when the Run ends.

Execution history shows each step's report and actual input/output versions. Select another execution to compare corresponding quality values and training results.

## Recover from failure

Missing outputs or unsuccessful quality conditions stop subsequent steps and record the reason. **Resume in a new execution** reuses successful steps and their exact outputs, then reruns the first incomplete step and the rest. Cancellation waits for the active Job to end.

For a manually submitted site, each Job waits until it is [submitted to the site](/en/compute/sites).
