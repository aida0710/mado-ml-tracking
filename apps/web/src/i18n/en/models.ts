import type { ModelAliasEventSource } from '@mmt/contracts';
import { intlLocaleOf } from '@mado/design-system/locale';
import { formatEnglishCount } from '../formatEnglishCount';
import { formatEnglishQuotedList } from '../formatEnglishQuotedList';

// Model registry labels: alias assignment, removal and alias history.
export const modelsText = {
  aliasReason: 'Reason',
  aliasReasonPlaceholder: 'e.g. WER improved in evaluation',
  removeAlias: 'Remove alias',
  aliasesEmpty: 'No aliases assigned yet',
  aliasHistory: 'Alias history',
  aliasHistoryEmpty: 'No alias changes yet',
  aliasHistoryLoadMore: 'Load more',
  aliasChangedAt: 'Date and time',
  aliasVersionChange: 'Previous version → New version',
  aliasActor: 'Changed by',
  aliasSource: 'Source',
  aliasActorSystem: 'System',
  aliasActorToken: 'API token',
  aliasUnassigned: '(none)',
  // Model version page: training Run → version → inference/evaluation Runs.
  modelVersionNotFound: 'Model version not found',
  modelVersionOpenPage: 'Open version details',
  modelVersionArtifactOpen: 'Open in Artifacts',
  modelVersionWeightsArtifact: 'Weights artifact',
  modelVersionSummary: 'Overview',
  modelVersionLineage: 'Datasets → Training run → Version → Inference / Evaluation runs',
  modelVersionLineageTruncated: 'Shows up to 20 inference/evaluation runs, newest first.',
  modelVersionAliases: 'Aliases for this version',
  modelVersionModel: 'Model',
  modelVersionAutomation: 'Automation',
  modelVersionAutomationTruncated: 'Shows 200 records, newest first. Older executions are available in automation history.',
  modelVersionNoExecutions: 'No automation for this version yet',
  evaluationResults: 'Evaluation results',
  evaluationResultsEmpty: 'No evaluation runs for this version yet',
  evaluationResultsTruncated: 'Aggregated from the 200 most recent runs.',
  evaluationSummary: 'Metric summary',
  evaluationSummaryHint: 'Latest value per metric from the most recently completed successful evaluation run. Baseline comparisons use the same evaluation code version and ground truth set.',
  evaluationSummaryEmpty: 'No metrics in successful evaluation runs',
  evaluationLatestValue: 'Latest value',
  evaluationDeltaSign: 'Difference sign',
  evaluationRuns: 'Evaluation run',
  evaluationAutomatic: 'Automatic evaluation',
  evaluationReferenceSet: 'Ground truth set',
  evaluationUpstreamOutputs: 'Upstream outputs',
  versionPromotionEvaluations: 'Promotion decisions for this version',
  versionPromotionEvaluationsEmpty: 'No promotion decisions for this candidate version yet',
  runDownstream: 'Runs launched from this run',
  runDownstreamEmpty: 'No runs launched from this run',
  loadMore: 'Load more',
  // Model family: chosen from the families the Project uses (models and code versions).
  familyHint:
    'Select an existing family or enter a new one. The model can run on code versions whose “Supported model families” contain exactly this string.',
  familiesLoadFailed: 'Could not load existing families. You can still type a family.',
  existingFamilies: 'Existing families (click to add)',
  // Code versions a Task or a model version can use.
  openCodes: 'Open Code',
  codeCandidatesNone: 'No code versions yet. Register one in Code to select it here.',
  // Model version form: weights chosen from the source Run's Artifacts.
  versionAutoNumberHint: 'Leave blank to number it automatically.',
  sourceRunHint:
    "Only training and fine-tuning runs can be selected. Selecting one lets you choose weights from that run's artifacts.",
  weightsArtifactHintRun: 'Showing artifacts from the source run. Filter by storage path.',
  weightsArtifactHintProject:
    'Showing project artifacts, newest first. Search by storage path, or paste an ID or an artifact://… URI.',
  weightsArtifactUnchosen:
    'Select “Weights artifact” from the list. Searching alone does not select it (clear the field if you do not use one).',
  weightsUriHint:
    'Location of weights not stored as an artifact (such as S3 or Hugging Face). Leave blank when you select an artifact.',
  weightsUriIsArtifact: 'This points to an artifact. Select it in “Weights artifact” to fetch the weights from it.',
  weightsUriUseAsArtifact: 'Select as weights artifact',
  parentsHint: 'Only versions in the same family can be selected.',
  parentsEmpty: 'No versions in the same family yet.',
  defaultCodeHint: "Only code versions supporting this version's model family can be selected.",
  // Which model runs on which code, shown on both the Models and the Code page.
  familyCodeVersions: 'Code versions for this family',
  codeUsage: 'How this code version is used',
  codeUsageModels: 'Models it can run',
  codeUsageNoModels: 'No models match its “Supported model families” yet',
  codeUsageTasks: 'Tasks using it',
  codeUsageRules: 'Automation rules using it',
} as const;

// The sign of candidate − baseline; better or worse depends on the metric and is not shown.
export const deltaSignLabels = {
  positive: '+ (above baseline)',
  negative: '− (below baseline)',
  zero: '±0 (equal)',
} as const;

export const modelAliasSourceLabels: Record<ModelAliasEventSource, string> = {
  web: 'Web',
  api: 'API',
  mlflow: 'MLflow',
  promotion_policy: 'Promotion policy',
  version_deleted: 'Version deletion',
  model_deleted: 'Model deletion',
};

// Text that embeds values.
export const modelsTextTemplates = {
  baselineValue: (alias: string) => `Baseline version (${alias})`,
  automaticByRule: (ruleName: string) => `Automatic evaluation (${ruleName})`,
  removeAliasConfirm: (alias: string, version: string) =>
    `Remove alias “${alias}” (version ${version})? The removal will be recorded in history.`,
  familyUsage: (modelCount: number, codeVersionCount: number) =>
    `${formatEnglishCount(modelCount, 'model')} · ${formatEnglishCount(codeVersionCount, 'code version')}`,
  familyNew: (family: string) => `“${family}” will be registered as a new family.`,
  familyCaseVariant: (family: string, variants: readonly string[]) =>
    `${formatEnglishQuotedList(variants)} already ${variants.length === 1 ? 'exists' : 'exist'}. Families that differ only in letter case are separate and do not match “${family}”.`,
  familyListCaseVariant: (family: string, variants: readonly string[]) =>
    `“${family}”: differs from the existing ${formatEnglishQuotedList(variants)} only in letter case. It counts as a separate family, so models in ${variants.length === 1 ? 'that family' : 'those families'} will not match.`,
  versionAutoNumber: (nextVersion: string) => `Leave blank to use ${nextVersion}.`,
  sourceRunOption: (run: { name: string; kind: string; date: string; status: string }) =>
    `${run.name} · ${run.kind} · ${run.date} · ${run.status}`,
  codeCandidatesNoTaskType: (kind: string) =>
    `No code version supports the run kind “${kind}”. In Code, create a version whose “Supported run kinds” include “${kind}”.`,
  codeCandidatesNoFamily: (family: string) =>
    `No code version supports the model family “${family}”. In Code, create a version whose “Supported model families” include “${family}”.`,
  versionsShown: (shown: number, total: number) =>
    `Showing the ${shown.toLocaleString(intlLocaleOf('en'))} newest of ${formatEnglishCount(total, 'version')}.`,
  familyCodeVersionsNone: (family: string) =>
    `None yet. In Code, create a code version whose “Supported model families” include “${family}” to use it for this model's tasks and automation.`,
  codeCandidatesNoCommonFamily: (families: readonly string[]) =>
    `No code version supports all of the selected families ${formatEnglishQuotedList(families)}. Include all of them in one code version's “Supported model families”, or create a separate rule for each family.`,
  codeCandidatesCaseVariant: (family: string, variants: readonly string[]) =>
    `Code versions list ${formatEnglishQuotedList(variants)}, but the letter case differs, so they do not match “${family}”.`,
};
