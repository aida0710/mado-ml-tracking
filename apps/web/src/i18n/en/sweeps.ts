import { formatEnglishCount } from '../formatEnglishCount';
import type {
  SweepMethod,
  SweepObjective,
  SweepStatus,
  SweepStatusReason,
  SweepTrialState,
} from '@mmt/contracts';
import type { SearchSpaceRowKind } from '../../lib/sweepConfig';

// Sweeps: the list, the create dialog with its search space editor, and the detail page.
export const sweepsText = {
  sweeps: 'Sweeps',
  sweepNew: 'Create sweep',
  sweepNone: 'No sweeps yet',
  sweepTask: 'Task',
  sweepMethod: 'Search method',
  sweepTrials: 'Trials',
  sweepTrialList: 'Trials',
  sweepRunningTrials: 'Running',
  sweepBestObjective: 'Best objective value',
  sweepCreatedBy: 'Created by',
  sweepTaskRevisionPinned: "Runs with the task's current revision fixed. Editing the task after creation stops the sweep.",
  sweepExperiment: 'Experiment',
  sweepExperimentHint: "Trial runs are added to the task's experiment.",
  sweepTarget: 'Computer',
  sweepTaskDefault: 'Task default',
  sweepGpuIds: 'GPUs (task default if none selected)',
  sweepGpuSiteTaskDefault: "Sites use the task's default GPU count.",
  sweepTargetRuntimeHint: "Only computers that support the runtime of the task's code version can be selected.",
  sweepObjective: 'Objective',
  sweepObjectiveMetric: 'Objective metric',
  sweepObjectiveMetricHint: "Suggestions come from metrics recorded in the task's past runs.",
  sweepGoal: 'Direction',
  sweepAggregation: 'Trial value aggregation',
  sweepMaxTrials: 'Maximum trials',
  sweepParallelism: 'Parallel trials',
  sweepSeed: 'Seed (blank lets the server choose)',
  sweepEarlyStopping: 'Early termination',
  sweepEarlyStoppingNone: 'None',
  sweepEarlyStoppingHyperband: 'Hyperband',
  sweepMinIter: 'min_iter',
  sweepEta: 'eta',
  sweepMaxIter: 'max_iter (optional)',
  sweepSearchSpace: 'Search space',
  sweepEditorRows: 'Edit rows',
  sweepEditorJson: 'W&B JSON',
  sweepJsonHint:
    'Paste a W&B sweep configuration (method, metric, parameters, early_terminate, run_cap, parallelism). Unsupported keys produce errors.',
  sweepJsonLoad: 'Load',
  sweepParameterName: 'Parameter name',
  sweepParameterKind: 'Type',
  sweepParameterValues: 'Values (comma separated)',
  sweepParameterValue: 'Value',
  sweepDistribution: 'Distribution',
  sweepMin: 'min',
  sweepMax: 'max',
  sweepQ: 'q',
  sweepAddParameter: 'Add parameter',
  sweepRemoveParameter: 'Remove parameter',
  sweepGridContinuous: 'Grid search does not support range parameters. Use values or constants.',
  sweepNameRequired: 'Enter a parameter name',
  sweepNameDuplicate: 'Duplicate parameter name',
  sweepValuesRequired: 'Enter at least one value',
  sweepValueRequired: 'Enter a value',
  sweepNumberRequired: 'Enter numeric min and max values',
  sweepQNumber: 'Enter a numeric q value',
  sweepNoParameters: 'Add at least one parameter',
  sweepObjectiveRequired: 'Enter an objective metric',
  sweepSeedError: 'Enter a non-negative integer',
  sweepStatusReason: 'Reason',
  sweepProgress: 'Progress',
  sweepBestTrial: 'Best trial',
  sweepNoBestTrial: 'No completed trials with objective values yet',
  sweepPause: 'Pause',
  sweepResume: 'Resume',
  sweepCancel: 'Cancel sweep',
  sweepCancelConfirm: 'Stops submitting new trials and cancels queued trials.',
  sweepCancelRunning: 'Also request stopping running trials',
  sweepChangeLimits: 'Change maximum trials and parallelism',
  sweepResumeUnavailable: 'The task was revised, so this sweep cannot resume. Create a new sweep.',
  sweepProgressChart: 'Objective value per trial',
  sweepBestSoFar: 'Best so far',
  sweepTrialObjective: 'Trial objective value',
  sweepTrialIndex: 'Trial',
  sweepObjectiveValue: 'Objective value',
  sweepTrialRun: 'Run',
  sweepTrialJob: 'Job',
  sweepSortByTrial: 'Trial order',
  sweepSortByObjective: 'Best objective first',
  sweepNoTrials: 'No trials yet',
  sweepAnalysis: 'Analysis',
  sweepObjectiveHistory: 'Trial objective metric',
  sweepDefinition: 'Definition',
  sweepSeedValue: 'Seed',
  sweepTaskRevision: 'Task revision',
} as const;

// Text that embeds values; merged into catalog's textTemplates.
export const sweepsTextTemplates = {
  sweepTrialProgress: (created: number, maxTrials: number) => `${created} / ${maxTrials}`,
  sweepGridEndsEarly: (combinations: number, maxTrials: number) =>
    `The grid has ${formatEnglishCount(combinations, 'combination')}, so the sweep ends before reaching the maximum of ${formatEnglishCount(maxTrials, 'trial')}.`,
  sweepGridFewerThanMaxTrials: (combinations: number) =>
    `The grid has ${formatEnglishCount(combinations, 'combination')}. The sweep ends after ${formatEnglishCount(combinations, 'trial')}.`,
  sweepTargetTaskDefault: (targetName: string) => `Task default (${targetName})`,
  sweepTaskGpusMissing: (gpuIds: string) =>
    `Without a GPU selection, trials use the task's GPUs (${gpuIds}), which this computer does not have. Select the GPUs to use.`,
  sweepGridCombinations: (count: number) => `Grid combinations: ${count}`,
  sweepGridTooMany: (count: number, limit: number) =>
    `Grid combinations are limited to ${limit} (requested: ${count}). Reduce values or use random or Bayesian search.`,
  sweepTrialRunName: (trialIndex: number) => `#${trialIndex}`,
  sweepEarlyStoppedReason: (stopReason: string) => `Stopped: ${stopReason}`,
  sweepSeriesLimited: (shown: number, total: number) =>
    `Showing the ${shown} newest trials (total: ${total}).`,
  sweepConfigNotObject: (where: string) => `Specify ${where} as a JSON object`,
  sweepConfigUnsupportedKeys: (where: string, keys: string[], allowed: string[]) =>
    `Unsupported keys in ${where}: ${keys.join(', ')} (allowed: ${allowed.join(', ')})`,
  sweepConfigOneOf: (key: string, allowed: readonly string[]) =>
    `${key} must be one of ${allowed.join(' / ')}`,
  sweepConfigPositiveInteger: (key: string) => `${key} must be a positive integer`,
  sweepConfigNonEmptyString: (key: string) => `${key} must be a non-empty string`,
  sweepConfigParameterValues: (name: string) =>
    `Parameter “${name}” values must be an array of strings, numbers, or booleans`,
  sweepConfigParameterValue: (name: string) =>
    `Parameter “${name}” value must be a string, number, or boolean`,
  sweepConfigParameterNumbers: (name: string, keys: string) =>
    `Parameter “${name}”: specify numeric values for ${keys}`,
  sweepConfigParameterNested: (name: string) =>
    `Parameter “${name}”: nested parameters are not supported`,
  sweepConfigParameterLogUniform: (name: string) =>
    `Parameter “${name}”: W&B log_uniform uses exponents. Use log_uniform_values to pass actual values.`,
  sweepConfigParameterDistribution: (name: string, distribution: string) =>
    `Parameter “${name}”: distribution “${distribution}” is not supported`,
  sweepConfigParameterShape: (name: string) =>
    `Parameter “${name}” requires values, value, or min and max`,
  sweepConfigParameterName: () => 'Parameter names must be non-empty strings',
};

export const sweepStatusLabels: Record<SweepStatus, string> = {
  running: 'Running',
  paused: 'Paused',
  finished: 'Completed',
  canceled: 'Canceled',
  failed: 'Failed',
};

export const sweepStatusReasonLabels: Record<SweepStatusReason, string> = {
  user_requested: 'User action',
  task_revision_changed: 'Task revised',
  owner_forbidden: 'Creator is no longer a project editor',
  launch_failed: 'Could not create trial job',
  max_trials_reached: 'Maximum trials reached',
  search_space_exhausted: 'All grid combinations exhausted',
  suggestion_failed: 'Could not suggest the next trial',
};

export const sweepTrialStateLabels: Record<SweepTrialState, string> = {
  queued: 'Queued',
  running: 'Running',
  finished: 'Completed',
  failed: 'Failed',
  canceled: 'Canceled',
  early_stopped: 'Stopped early',
};

export const sweepMethodLabels: Record<SweepMethod, string> = {
  grid: 'grid',
  random: 'random',
  bayes: 'bayes',
};

export const sweepGoalLabels: Record<SweepObjective['goal'], string> = {
  minimize: 'Minimize',
  maximize: 'Maximize',
};

export const sweepAggregationLabels: Record<SweepObjective['aggregation'], string> = {
  last: 'Last value (last)',
  min: 'Minimum value (min)',
  max: 'Maximum value (max)',
};

export const searchSpaceRowKindLabels: Record<SearchSpaceRowKind, string> = {
  values: 'Values',
  range: 'Range',
  constant: 'Constant',
};
