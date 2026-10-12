export const workflowsText = {
  workflows: 'Workflows',
  workflowDescription:
    'Pin preprocessing, training and evaluation settings, then run them in order.',
  workflowCatalogBoundary:
    'The Data Catalog records data origins and storage. Workflows record processing conditions, quality and the versions used for training.',
  workflowNew: 'Create workflow',
  workflowNewVersion: 'Create new version',
  workflowVersion: 'Workflow version',
  workflowOlderVersions: 'Load older versions',
  workflowSnapshotHint:
    'Saving pins the current task settings. Later task edits do not change this version.',
  workflowNewVersionHint: 'This new version uses the current settings of the selected tasks.',
  workflowSteps: 'Steps',
  workflowAddStep: 'Add step',
  workflowRemoveStep: 'Remove step',
  workflowRemoveStepConfirm: 'Remove',
  workflowStepKey: 'Step key',
  workflowStepName: 'Step name',
  workflowTask: 'Task',
  workflowInputs: 'Input data',
  workflowAddInput: 'Add input',
  workflowSource: 'Source',
  workflowFixedDataset: 'Pinned dataset version',
  workflowStepDataset: 'Output from an earlier step',
  workflowSourceStep: 'Source step',
  workflowDatasetName: 'Output dataset name (empty for all outputs)',
  workflowDatasetVersion: 'Dataset version',
  workflowRole: 'Usage',
  workflowWeight: 'Mixing weight',
  workflowSelection: 'Selection conditions (JSON)',
  workflowSelectionHint:
    'The execution code reads these conditions and weights. Saving them does not apply sampling automatically.',
  workflowModelSource: 'Input model',
  workflowTaskModel: "Use the task's model",
  workflowQualityGates: 'Conditions to continue',
  workflowAddGate: 'Add quality condition',
  workflowMetric: 'Metric',
  workflowOperator: 'Comparison',
  workflowThreshold: 'Threshold',
  workflowGateHint: 'If a required metric is missing or a condition fails, subsequent steps stop.',
  workflowStart: 'Start workflow',
  workflowStartConfirm: 'Start',
  workflowStartEffect:
    "Each step's task starts as a job, in order, with the settings saved in this version.",
  workflowResume: 'Resume in a new execution',
  workflowResumeConfirm: 'Resume',
  workflowResumeHint:
    'Completed steps keep their run and outputs. The first incomplete step and the steps after it run again.',
  workflowResumeEffect:
    'A new execution reuses the runs and outputs of the completed steps and starts from the first incomplete step. The original execution stays in the history.',
  workflowCancel: 'Stop workflow',
  workflowCancelConfirm: 'Stop',
  workflowCancelEffect:
    'Asks the running job to stop and starts no further steps. The execution shows “Stop requested” until the job stops.',
  workflowControlOwnerOnly:
    "Only the execution's creator or a project administrator can stop or resume",
  workflowHistory: 'Execution history',
  workflowExecution: 'Execution',
  workflowCompare: 'Compare with another execution',
  workflowNoComparison: 'No comparison',
  workflowNoExecutions: 'No executions yet',
  workflowNoTasks: 'Create tasks with execution computers before building a workflow.',
  workflowReused: 'Reused from previous execution',
  workflowOpenRun: 'Open run',
  workflowOpenJob: 'Open job',
  workflowOpen: 'Open workflow',
  workflowResumeFromJob: 'Resume from the workflow',
  workflowNextPage: 'Older executions',
  workflowFirstPage: 'Latest executions',
  workflowOutputs: 'Output versions',
  workflowInputRole: 'Processing input',
  workflowTrainingRole: 'Training',
  workflowValidationRole: 'Validation',
  workflowTestRole: 'Test',
  workflowPending: 'Waiting for preceding step',
  workflowChoose: 'Choose…',
  workflowDraftTaskMissing: 'Choose a task.',
  workflowDraftNameOrKeyMissing: 'Enter a step name and key.',
  workflowDraftModelSourceNotEarlier: 'Choose an earlier step as the source of the input model.',
  workflowDraftSourceStepNotEarlier: 'Choose an earlier step as the source.',
  workflowDraftDatasetVersionMissing: 'Choose a dataset version.',
  workflowDraftSelectionInvalid:
    'Enter the selection conditions as a JSON object in { } (use {} for none).',
  workflowDraftWeightInvalid: 'Enter a weight greater than 0.',
  workflowDraftGateInvalid: 'Enter a metric name and a numeric threshold.',
  workflowDraftStepInvalid: 'Check the step settings.',
  preprocessingReport: 'Preprocessing report',
  preprocessingNoReport:
    'No report yet. The processing code can submit one with Run.log_preprocessing_report().',
  preprocessingInput: 'Input count',
  preprocessingOutput: 'Output count',
  preprocessingExcluded: 'Excluded count',
  preprocessingFailed: 'Failed count',
  preprocessingInputDuration: 'Input duration (seconds)',
  preprocessingOutputDuration: 'Output duration (seconds)',
  preprocessingReasons: 'Exclusion / failure reasons',
  preprocessingSamples: 'Sample artifacts',
  preprocessingReasonsJson: 'Exclusion / failure reasons (JSON)',
  preprocessingMetricsJson: 'Metrics (JSON)',
  preprocessingSampleIds: 'Sample artifact IDs',
  preprocessingReportEdit: 'Record preprocessing report',
  preprocessingReportHint:
    'Reports are fixed when the run ends. Reasons, custom quality metrics and sample artifact IDs can also be sent through the SDK or API.',
  preprocessingReasonsInvalid:
    'Enter the reasons as JSON like {"exclusions": [{"reason": "too short", "count": 3}], "failures": []}.',
  preprocessingMetricsInvalid:
    'Enter the metrics as a JSON object of names and numbers. Names cannot start with preprocessing. (the summary metrics use it).',
  preprocessingReportInvalid:
    "Counts and durations must be 0 or more, excluded plus failed must not exceed the input count, and the reason counts must add up to each total. Samples must be artifact IDs of this run.",
  preprocessingUsage: 'Dataset usage in this execution',
} as const;

// Text that embeds values.
export const workflowsTextTemplates = {
  workflowVersionLabel: (revision: number) => `v${revision}`,
  workflowStartTarget: (workflowName: string, revision: number) =>
    `Starts version v${revision} of the workflow “${workflowName}”.`,
  workflowResumeTarget: (executionId: string, revision: number) =>
    `Resumes execution ${executionId} (version v${revision}) in a new execution.`,
  workflowCancelTarget: (execution: { executionId: string; revision: number; createdByName: string }) =>
    `Execution ${execution.executionId} (version v${execution.revision}) · Created by: ${execution.createdByName}`,
  workflowStarted: (executionId: string, revision: number) =>
    `Started execution ${executionId} (version v${revision}).`,
  workflowCancelRequested: (executionId: string) =>
    `Asked execution ${executionId} to stop. It becomes Canceled when the running job stops.`,
  workflowRemoveStepTarget: (stepName: string) =>
    `Removes the step “${stepName}”. Later steps that take their input or model from it must choose another source.`,
  workflowMissingStepReference: (stepKey: string) =>
    `The earlier step “${stepKey}” is not there. Choose another one.`,
  workflowDraftStepProblem: (step: number, problem: string) => `Step ${step}: ${problem}`,
  workflowDraftInputProblem: (step: number, input: number, problem: string) =>
    `Step ${step}, input ${input}: ${problem}`,
  workflowDraftGateProblem: (step: number, gate: number, problem: string) =>
    `Step ${step}, quality condition ${gate}: ${problem}`,
  workflowDraftDuplicateKey: (stepKey: string) =>
    `An earlier step already uses the key “${stepKey}”. Choose another key.`,
  workflowDraftUnknownPreprocessingMetric: (names: string) =>
    `Metrics starting with preprocessing. are only the preprocessing report's summary values (${names}). Give your own quality values another name.`,
};
