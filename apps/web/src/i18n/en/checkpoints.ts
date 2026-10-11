import { formatEnglishCount } from '../formatEnglishCount';
import type { RunCheckpointSource } from '@mmt/contracts';

// Run checkpoints and resuming training from one: the Run tab, the resume dialog and the Jobs page.
export const checkpointsText = {
  checkpoints: 'Checkpoint',
  checkpointEmpty:
    "No checkpoints for this run yet. Save one with the SDK's run.log_checkpoint(directory, step=…) to resume training from here.",
  checkpointShowHidden: "Include checkpoints outside the retention limit",
  checkpointHidden: "Outside retention limit",
  checkpointHiddenHint: "Hidden because newer checkpoints exceeded the retention limit. This checkpoint can still be used to resume.",
  checkpointOptimizer: 'Optimizer',
  checkpointIncludesOptimizer: "Included",
  checkpointExcludesOptimizer: "Not included",
  checkpointFramework: 'Framework',
  checkpointResume: "Resume from this checkpoint",
  checkpointResumeTitle: "Resume from checkpoint",
  checkpointResumeLatest: "Resume from latest checkpoint",
  checkpointResumeLatestMessage:
    "Resume training as a new run from the latest checkpoint (highest step) saved by this job's run.",
  checkpointResumeKeepsSourceRun: "The original run and checkpoint are kept unchanged.",
  checkpointResumeSubmit: "Resume as a new run",
  checkpointResumeNoJob: "The job that executed this run was not found, so it cannot be resumed here.",
  checkpointResumeCreatorOnly:
    "Only this run's creator or a project administrator can resume from a checkpoint.",
  checkpointResumedBadge: "Resumed",
  checkpointResumedBadgeHint: "This job belongs to a run resumed from a checkpoint",
  checkpointSourceRun: "Original run",
} as const;

// Text that embeds values; merged into catalog's textTemplates.
export const checkpointsTextTemplates = {
  checkpointResumedFromStep: (step: number) => `Resumed from checkpoint at step ${step}`,
  checkpointResumeMessage: (step: number) =>
    `Resume training as a new run from the checkpoint at step ${step}?`,
  checkpointFileCount: (count: number) => formatEnglishCount(count, 'file'),
};

export const checkpointSourceLabels: Record<RunCheckpointSource, string> = {
  native: 'SDK',
  mlflow: 'MLflow',
};
