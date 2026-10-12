export const comparisonText = {
  comparisonBaselineRun: 'Baseline run',
  comparisonNoBaseline: 'None',
  comparisonBaselineMarker: 'Baseline',
  comparisonOnlyDifferences: 'Only differences',
  comparisonDownloadCsv: 'Download CSV',
  comparisonModelVersion: 'Model version',
  comparisonDatasetVersions: 'Evaluation dataset version',
  comparisonNoDifferences: 'No differences between the selected runs',
  exportRunsCsv: 'Export search results to CSV',
  exportingRunsCsv: 'Creating CSV…',
  exportRunsTruncated:
    'Matching runs exceeded the export limit. The export was truncated, as noted at the end of the CSV.',
} as const;

// Text that embeds values; merged into catalog's textTemplates.
export const comparisonTextTemplates = {
  comparisonRunCountOutOfRange: (minimum: number, maximum: number) =>
    `Select ${minimum}–${maximum} runs to compare.`,
};
