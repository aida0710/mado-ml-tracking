export const evaluationText = {
  evaluationComparison: "Evaluation comparison with baseline version",
  baselineAlias: "Baseline alias",
  baselineVersion: "Baseline version",
  noModelAliases: "Alias not assigned",
  comparisonBaselineMissing: "Cannot compare because the baseline alias is not assigned.",
  comparisonBaselineNotEvaluated:
    "The baseline has no completed evaluation run with the same ground truth set and evaluation code version.",
  comparisonCandidateNotEvaluated: "This version has no completed evaluation runs.",
  comparisonConditions: "Comparison settings",
  referenceDatasets: "Ground truth set",
  noReferenceDatasets: "None",
  evaluationCodeVersion: "Evaluation code version",
  evaluationRule: "Evaluation rules",
  candidateEvaluationRun: "Candidate evaluation run",
  baselineEvaluationRun: "Baseline evaluation run",
  metricCandidate: "Candidate",
  metricBaseline: "Baseline",
  metricDelta: "Difference",
  metricRelativeDelta: "Relative difference",
  metricSource: "Value source",
  metricSourceDatasetContext: "Value recorded for the ground truth set",
  metricSourceRunLatest: "Latest run value",
  metricNotFinite: 'NaN/∞',
  noComparedMetrics: "No comparable metrics",
  baselineChoice: "Baseline version",
  baselineChoiceAliasGroup: "Select by alias",
  baselineChoiceVersionGroup: "Select a version directly",
  baselineIsCandidate: "This version is its own baseline, so all differences are zero. Select a different version.",
} as const;

export const evaluationTextTemplates = {
  versionLabel: (version: string) => `Version ${version}`,
  baselineAliasOption: (alias: string, versionLabel: string) => `${alias}（${versionLabel}）`,
  baselineFallbackHint: (alias: string) =>
    `${alias} points to this version, so the previously registered version is used as the baseline.`,
};
