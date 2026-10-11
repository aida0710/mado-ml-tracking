import type { JsonObject } from './index.js';

// Keep reports small enough to inspect alongside a Run; detailed item lists belong in Artifacts.
export const PREPROCESSING_MAX_REASONS = 100;
export const PREPROCESSING_MAX_SAMPLES = 20;
export const PREPROCESSING_REASON_MAX_LENGTH = 1000;
export const PREPROCESSING_MAX_METRICS = 100;
// Match the native Run metric-name limit; this prefix belongs to the report's computed summary.
export const PREPROCESSING_MAX_METRIC_NAME_LENGTH = 250;
export const PREPROCESSING_METRIC_PREFIX = 'preprocessing.';

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
