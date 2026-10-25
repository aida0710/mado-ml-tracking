import type { JsonObject } from './index.js';

// レポートはRunと並べて確かめられる小ささに保つ。項目の詳しい一覧はArtifactに置く。
export const PREPROCESSING_MAX_REASONS = 100;
export const PREPROCESSING_MAX_SAMPLES = 20;
export const PREPROCESSING_REASON_MAX_LENGTH = 1000;
export const PREPROCESSING_MAX_METRICS = 100;
// ネイティブのRunのメトリクス名の上限に合わせる。この接頭辞は、レポートから計算したサマリーが使う。
export const PREPROCESSING_MAX_METRIC_NAME_LENGTH = 250;
export const PREPROCESSING_METRIC_PREFIX = 'preprocessing.';
/**
 * APIがレポートから計算するサマリーのメトリクス。これ以外のpreprocessing.*の名前は記録され
 * ないので、それに対する品質ゲートは決して通らない。
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
// ワークフローの実行はどれもステップのレポートを並べるので、metadataはRunのメディアの
// metadataと同じ大きさの短いメモにとどめる。詳しい一覧はArtifactに置く。
export const PREPROCESSING_METADATA_MAX_BYTES = 16 * 1024;
// 短いメモなら、入れ子は浅くて足りる。
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
