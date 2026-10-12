import type { JsonObject, PreprocessingReportInput } from '@mmt/contracts';
import { preprocessingReportInputSchema } from '@mmt/contracts/schemas';
import { workflowsText } from '../i18n/workflows';
import { parseJsonObjectOrNull } from './formValues';
import { LocalizedError } from './localizedError';

/** What the report dialog holds: number fields, duration fields that may be empty, and JSON text. */
export interface PreprocessingReportFields {
  counts: Pick<PreprocessingReportInput, 'inputCount' | 'outputCount' | 'excludedCount' | 'failedCount'>;
  durations: { inputDurationSeconds: string; outputDurationSeconds: string };
  /** {"exclusions": [...], "failures": [...]} */
  reasonsJson: string;
  /** {"name": number, ...} */
  metricsJson: string;
  /** Artifact IDs separated by spaces or lines. */
  samples: string;
  /** Kept from the report being replaced; the dialog does not edit it. */
  metadata: JsonObject;
}

const REASON_FIELDS: readonly PropertyKey[] = ['exclusions', 'failures'];

const optionalSeconds = (seconds: string) => (seconds.trim() ? Number(seconds) : null);

/**
 * The report to send, checked as the API checks it. A refusal is a LocalizedError about the part
 * to fix: the reasons JSON, the metrics JSON, or the counts and samples.
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
  // A reason list of the wrong shape; reason counts that do not add up are a 'custom' issue.
  if (field !== undefined && REASON_FIELDS.includes(field) && issue?.code !== 'custom')
    throw new LocalizedError(() => workflowsText.preprocessingReasonsInvalid);
  throw new LocalizedError(() => workflowsText.preprocessingReportInvalid);
}
