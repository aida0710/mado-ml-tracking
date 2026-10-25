import type { JsonObject, PreprocessingReportInput } from '@mmt/contracts';
import { preprocessingReportInputSchema } from '@mmt/contracts/schemas';
import { workflowsText } from '../i18n/workflows';
import { parseJsonObjectOrNull } from './formValues';
import { LocalizedError } from './localizedError';

/** レポートのダイアログが持つ値。数の欄、空でもよい時間の欄、JSONの文字列。 */
export interface PreprocessingReportFields {
  counts: Pick<PreprocessingReportInput, 'inputCount' | 'outputCount' | 'excludedCount' | 'failedCount'>;
  durations: { inputDurationSeconds: string; outputDurationSeconds: string };
  /** {"exclusions": [...], "failures": [...]} */
  reasonsJson: string;
  /** {"name": number, ...} */
  metricsJson: string;
  /** 空白か改行で区切ったArtifactのID。 */
  samples: string;
  /** 置き換える前のレポートから引き継ぐ。ダイアログでは編集しない。 */
  metadata: JsonObject;
}

const REASON_FIELDS: readonly PropertyKey[] = ['exclusions', 'failures'];

const optionalSeconds = (seconds: string) => (seconds.trim() ? Number(seconds) : null);

/**
 * 送るレポート。APIと同じ検査をする。拒むときは、直すべき部分（理由のJSON、メトリクスのJSON、
 * 件数とサンプル）についてのLocalizedErrorを投げる。
 */
export function buildPreprocessingReportInput(fields: PreprocessingReportFields): PreprocessingReportInput {
  const reasons = parseJsonObjectOrNull(fields.reasonsJson);
  if (!reasons || Object.keys(reasons).some((key) => !REASON_FIELDS.includes(key)))
    throw new LocalizedError(() => workflowsText.preprocessingReasonsInvalid);
  const metrics = parseJsonObjectOrNull(fields.metricsJson);
  if (!metrics) throw new LocalizedError(() => workflowsText.preprocessingMetricsInvalid);
  const parsed = preprocessingReportInputSchema.safeParse({
    ...fields.counts,
    exclusions: reasons.exclusions,
    failures: reasons.failures,
    inputDurationSeconds: optionalSeconds(fields.durations.inputDurationSeconds),
    outputDurationSeconds: optionalSeconds(fields.durations.outputDurationSeconds),
    metrics,
    sampleArtifactIds: fields.samples.split(/\s+/).filter(Boolean),
    metadata: fields.metadata,
  });
  if (parsed.success) return parsed.data;
  const issue = parsed.error.issues[0];
  const field = issue?.path[0];
  if (field === 'metrics') throw new LocalizedError(() => workflowsText.preprocessingMetricsInvalid);
  // 理由の一覧の形が違うとき。理由の件数が合わないのは'custom'のissueになる。
  if (field !== undefined && REASON_FIELDS.includes(field) && issue?.code !== 'custom')
    throw new LocalizedError(() => workflowsText.preprocessingReasonsInvalid);
  throw new LocalizedError(() => workflowsText.preprocessingReportInvalid);
}
