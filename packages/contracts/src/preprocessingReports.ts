import type { JsonObject } from './index.js';

// Keep reports small enough to inspect alongside a Run; detailed item lists belong in Artifacts.
export const PREPROCESSING_MAX_REASONS = 100;
export const PREPROCESSING_MAX_SAMPLES = 20;
export const PREPROCESSING_REASON_MAX_LENGTH = 1000;
export const PREPROCESSING_MAX_METRICS = 100;
// Match the native Run metric-name limit; this prefix belongs to the report's computed summary.
export const PREPROCESSING_MAX_METRIC_NAME_LENGTH = 250;
export const PREPROCESSING_METRIC_PREFIX = 'preprocessing.';
/**
 * The summary metrics the API computes from a report; no other preprocessing.* name is ever
 * recorded, so a quality gate on one could never pass.
 */
export const PREPROCESSING_SUMMARY_METRIC_NAMES = [
  'preprocessing.input_count',
  'preprocessing.output_count',
  'preprocessing.excluded_count',
  'preprocessing.failed_count',
  'preprocessing.retained_input_ratio',
  'preprocessing.input_duration_seconds',
  'preprocessing.output_duration_seconds',
] as const;
export type PreprocessingSummaryMetricName = (typeof PREPROCESSING_SUMMARY_METRIC_NAMES)[number];
// Every workflow execution lists its steps' reports, so metadata stays a short note, as large as
// Run media metadata; detailed lists belong in Artifacts.
export const PREPROCESSING_METADATA_MAX_BYTES = 16 * 1024;
// A short note needs little nesting.
export const PREPROCESSING_METADATA_MAX_DEPTH = 10;

export interface PreprocessingReason {
  reason: string;
  count: number;
}

export interface PreprocessingReportInput {
  inputCount: number;
  outputCount: number;
  excludedCount: number;
  failedCount: number;
  inputDurationSeconds?: number | null;
  outputDurationSeconds?: number | null;
  exclusions?: PreprocessingReason[];
  failures?: PreprocessingReason[];
  metrics?: Record<string, number>;
  sampleArtifactIds?: string[];
  metadata?: JsonObject;
}

export interface PreprocessingReport {
  runId: string;
  projectId: string;
  revision: number;
  inputCount: number;
  outputCount: number;
  excludedCount: number;
  failedCount: number;
  inputDurationSeconds: number | null;
  outputDurationSeconds: number | null;
  exclusions: PreprocessingReason[];
  failures: PreprocessingReason[];
  metrics: Record<string, number>;
  sampleArtifactIds: string[];
  metadata: JsonObject;
  updatedAt: string;
}

export interface PreprocessingReportResponse {
  report: PreprocessingReport | null;
}
