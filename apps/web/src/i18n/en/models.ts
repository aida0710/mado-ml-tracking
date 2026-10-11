import type { ModelAliasEventSource } from '@mmt/contracts';

// Model registry labels: alias assignment, removal and alias history.
export const modelsText = {
  aliasReason: "Reason",
  aliasReasonPlaceholder: "e.g. WER improved in evaluation",
  removeAlias: "Remove alias",
  aliasesEmpty: "No aliases assigned yet",
  aliasHistory: "Alias history",
  aliasHistoryEmpty: "No alias changes yet",
  aliasHistoryLoadMore: "Load more",
  aliasChangedAt: "Date and time",
  aliasVersionChange: "Previous version → New version",
  aliasActor: "Actor",
  aliasSource: "Source",
  aliasActorSystem: "System",
  aliasActorToken: "API token",
  aliasUnassigned: "(none)",
  // Model version page: training Run → version → inference/evaluation Runs.
  modelVersionNotFound: "Model version not found",
  modelVersionOpenPage: "Open version details",
  modelVersionArtifactOpen: "Open in Artifacts",
  modelVersionWeightsArtifact: "Weights artifact",
  modelVersionSummary: "Overview",
  modelVersionLineage: "Training run → Version → Inference / Evaluation runs",
  modelVersionLineageTruncated: "Shows up to 20 inference/evaluation runs, newest first.",
  modelVersionAliases: "Aliases for this version",
  modelVersionModel: "Model",
  modelVersionAutomation: "Automation",
  modelVersionAutomationTruncated: "Shows 200 records, newest first. Older executions are available in automation history.",
  modelVersionNoExecutions: "No automation for this version yet",
  evaluationResults: "Evaluation results",
  evaluationResultsEmpty: "No evaluation runs for this version yet",
  evaluationResultsTruncated: "Aggregated from the 200 most recent runs.",
  evaluationSummary: "Metric summary",
  evaluationSummaryHint: "Latest value per metric from the most recently completed successful evaluation run. Baseline comparisons use the same evaluation code version and ground truth set.",
  evaluationSummaryEmpty: "No metrics in successful evaluation runs",
  evaluationLatestValue: "Latest value",
  evaluationDeltaSign: "Difference sign",
  evaluationRuns: "Evaluation run",
  evaluationAutomatic: "Automatic evaluation",
  evaluationReferenceSet: "Ground truth set",
  evaluationUpstreamOutputs: "Upstream outputs",
  versionPromotionEvaluations: "Promotion decisions for this version",
  versionPromotionEvaluationsEmpty: "No promotion decisions for this candidate version yet",
  runDownstream: "Runs launched from this run",
  runDownstreamEmpty: "No runs launched from this run",
  loadMore: "Load more",
} as const;

// The sign of candidate − baseline; better or worse depends on the metric and is not shown.
export const deltaSignLabels = {
  positive: "+ (above baseline)",
  negative: "− (below baseline)",
  zero: "±0 (equal)",
} as const;

export const modelAliasSourceLabels: Record<ModelAliasEventSource, string> = {
  web: 'Web',
  api: 'API',
  mlflow: 'MLflow',
  promotion_policy: "Promotion policy",
  version_deleted: "Version deletion",
  model_deleted: "Model deletion",
};

// Text that embeds values.
export const modelsTextTemplates = {
  baselineValue: (alias: string) => `Baseline version (${alias})`,
  automaticByRule: (ruleName: string) => `Automatic evaluation (${ruleName})`,
  removeAliasConfirm: (alias: string, version: string) =>
    `Remove alias “${alias}” (version ${version})? The removal will be recorded in history.`,
};
