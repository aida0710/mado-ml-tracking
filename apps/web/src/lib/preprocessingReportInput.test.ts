import { describe, expect, it } from 'vitest';
import { formatErrorMessage } from './errorMessage';
import { buildPreprocessingReportInput, type PreprocessingReportFields } from './preprocessingReportInput';
import { workflowsText } from '../i18n/workflows';

const fields = (changes: Partial<PreprocessingReportFields>): PreprocessingReportFields => ({
  counts: { inputCount: 10, outputCount: 8, excludedCount: 2, failedCount: 0 },
  durations: { inputDurationSeconds: '60', outputDurationSeconds: '' },
  reasonsJson: '{"exclusions": [{"reason": "短い音声", "count": 2}], "failures": []}',
  metricsJson: '{"snr_mean": 21.5}',
  samples: '',
  metadata: {},
  ...changes,
});

function refusal(changes: Partial<PreprocessingReportFields>): string {
  try {
    buildPreprocessingReportInput(fields(changes));
  } catch (failure) {
    return formatErrorMessage(failure);
  }
  throw new Error('expected the report to be refused');
}

describe('前処理レポートの入力', () => {
  it('理由・メトリクス・空の時間を、APIの形にして送る', () => {
    expect(buildPreprocessingReportInput(fields({}))).toMatchObject({
      inputCount: 10,
      exclusions: [{ reason: '短い音声', count: 2 }],
      failures: [],
      inputDurationSeconds: 60,
      outputDurationSeconds: null,
      metrics: { snr_mean: 21.5 },
    });
  });

  it('入力ミスは、ワークフローではなくレポートの直すべき欄を示す', () => {
    expect(refusal({ reasonsJson: '[]' })).toBe(workflowsText.preprocessingReasonsInvalid);
    expect(refusal({ reasonsJson: '{"exclusion": []}' })).toBe(
      workflowsText.preprocessingReasonsInvalid,
    );
    expect(refusal({ metricsJson: '{"preprocessing.snr": 1}' })).toBe(
      workflowsText.preprocessingMetricsInvalid,
    );
    expect(refusal({ metricsJson: '{"snr": "high"}' })).toBe(
      workflowsText.preprocessingMetricsInvalid,
    );
    expect(refusal({ reasonsJson: '{"exclusions": [], "failures": []}' })).toBe(
      workflowsText.preprocessingReportInvalid,
    );
    expect(refusal({ samples: 'not-an-artifact-id' })).toBe(
      workflowsText.preprocessingReportInvalid,
    );
  });
});
