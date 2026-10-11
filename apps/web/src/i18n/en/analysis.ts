import { formatEnglishCount } from '../formatEnglishCount';
import type { ImportanceUnavailableReason, ParameterExclusionReason, ParameterImportanceResult } from '@mmt/contracts';

// Exploring a set of Runs: parallel coordinates, parameter importance and the param scatter plot,
// shared by the Run list, Compare and Sweep pages.
export const analysisText = {
  analysisTitle: "Analyze search results",
  analysisParallel: "Parallel coordinates",
  analysisImportance: "Parameter importance",
  analysisScatter: "Scatter plot",
  analysisTarget: "Objective metric",
  analysisSweepObjective: "Objective value",
  analysisNoMetrics: "No metrics have been recorded for these runs",
  analysisTooFewRuns: "Analysis requires at least two runs",
  analysisNoRuns: "No runs to analyze",
  analysisAxes: "Visible axes",
  analysisMissing: "Missing",
  analysisMoveAxisLeft: "Move left",
  analysisMoveAxisRight: "Move right",
  analysisLogScale: "Log scale",
  analysisClearBrushes: "Clear filters",
  analysisBrushHint: "Drag on an axis to filter by range. Click the axis to clear the filter.",
  analysisColorLow: "Low",
  analysisColorHigh: "High",
  analysisColorMissing: "No value",
  analysisSelectedRuns: "Filtered runs",
  analysisParam: "Parameter",
  analysisImportanceColumn: "Importance",
  analysisCorrelation: "Correlation",
  analysisCoverage: "Coverage",
  analysisKind: "Type",
  analysisImportanceImpurity: "Impurity reduction",
  analysisImportancePermutation: "Permutation",
  analysisImportanceMethod: "Importance calculation",
  analysisExcluded: "Excluded parameters",
  analysisNoParams: "No parameters with values",
  analysisSortAscending: "Ascending",
  analysisSortDescending: "Descending",
  analysisScatterX: "X axis",
  analysisScatterY: "Y axis",
  analysisScatterColor: "Color",
  analysisScatterNoColor: "None",
  analysisScatterNoPoints: "No runs have values on both axes",
  analysisScatterHint: "Click a point to open run details.",
  analysisRunName: 'Run',
} as const;

// Text that embeds values; merged into catalog's textTemplates.
export const analysisTextTemplates = {
  analysisSelectionCount: (selected: number, total: number) => `${selected} of ${total}`,
  analysisRunCount: (runCount: number, skipped: number) =>
    skipped > 0
      ? `Calculated from ${formatEnglishCount(runCount, 'run')} (excluding ${formatEnglishCount(skipped, 'run')} without objective values)`
      : `Calculated from ${formatEnglishCount(runCount, 'run')}`,
  analysisOutOfBagR2: (r2: string) => `Model fit (out-of-bag R²): ${r2}`,
  analysisAxisCount: (shown: number, total: number) => `${shown} / ${total}`,
  analysisMoreSelectedRuns: (count: number) => `${count} more`,
};

export const importanceUnavailableReasonLabels: Record<ImportanceUnavailableReason, string> = {
  too_few_runs: "Importance is not calculated with fewer than five runs containing objective values. Only correlations are shown.",
};

export const parameterExclusionReasonLabels: Record<ParameterExclusionReason, string> = {
  high_cardinality: "Category with too many distinct values (over 50)",
  no_values: "No runs with values",
};

export const importanceTargetSourceLabels: Record<ParameterImportanceResult['targetSource'], string> = {
  latest_metric: "Latest metric value",
  sweep_objective: "Aggregated objective value of sweep trials",
};

export const analysisParamKindLabels = {
  numeric: "Numeric",
  categorical: "Categorical",
} as const;
