import type { PreprocessingReportInput } from '@mmt/contracts';

/** レポート、Runのグラフ、ワークフローの品質ゲートで共有する、変わらないメトリクス名。 */
export function preprocessingMetrics(report: PreprocessingReportInput): Record<string, number> {
  return {
    ...report.metrics,
    'preprocessing.input_count': report.inputCount,
    'preprocessing.output_count': report.outputCount,
    'preprocessing.excluded_count': report.excludedCount,
    'preprocessing.failed_count': report.failedCount,
    ...(report.inputCount > 0
      ? {
          'preprocessing.retained_input_ratio':
            (report.inputCount - report.excludedCount - report.failedCount) / report.inputCount,
        }
      : {}),
    ...(report.inputDurationSeconds !== null && report.inputDurationSeconds !== undefined
      ? {
          'preprocessing.input_duration_seconds': report.inputDurationSeconds,
        }
      : {}),
    ...(report.outputDurationSeconds !== null && report.outputDurationSeconds !== undefined
      ? {
          'preprocessing.output_duration_seconds': report.outputDurationSeconds,
        }
      : {}),
  };
}
