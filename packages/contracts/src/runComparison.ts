import type { MetricSeries } from './metricSeries.js';
import type { Run } from './index.js';

// 上限はdocs/api-contract.mdで公開している。
export const RUN_COMPARISON_MIN_RUNS = 2;
export const RUN_COMPARISON_MAX_RUNS = 50;
export const RUN_COMPARISON_MAX_METRIC_KEYS = 200;
// 検索のCSVエクスポートの応答ヘッダー。行数の上限でエクスポートが途中で切れたとき"true"になる。
export const RUN_EXPORT_TRUNCATED_HEADER = 'X-MMT-Export-Truncated';

/** POST /projects/:p/runs/compare。runIdsは、応答のどの配列でもその順を保つ。 */
export interface RunComparisonRequest {
  runIds: string[];
  /** runIdsのどれか1つ。指定すると、メトリクスの行に各RunとこのRunとの差が付く。 */
  baselineRunId?: string;
  /** 返すメトリクスの行（この順）。省略時は、記録されたすべてのメトリクスキーを名前の順に返す。 */
  metricKeys?: string[];
  /** 先頭50個のメトリクスの行に、間引いたstepの系列を加える（POST /metrics/seriesと同じ）。 */
  includeHistory?: boolean;
}

export type RunComparisonNamespace = 'params' | 'metrics' | 'tags';
/**
 * parameterはJSONの型を保つ。オブジェクトと配列はJSONのテキストで届く。
 * NaNのメトリクスは'NaN'で届く。
 */
export type RunComparisonValue = string | number | boolean | null;

export interface RunComparisonRow {
  namespace: RunComparisonNamespace;
  key: string;
  /** runIdsの順に、Runごとに1つの値。Runにそのキーが無ければnull。 */
  values: RunComparisonValue[];
  /** ベースラインがあるメトリクスだけ: Runごとの値−ベースライン。両方が有限でなければnull。 */
  deltaFromBaseline?: (number | null)[];
  /** Runごとのdelta ÷ |baseline|。deltaがnullかベースラインが0ならnull。 */
  relativeDeltaFromBaseline?: (number | null)[];
}

export interface ComparedDatasetVersion {
  id: string;
  datasetId: string;
  namespace: string;
  name: string;
  version: string;
  digest: string;
}

export interface ComparedModelVersion {
  id: string;
  modelId: string;
  modelName: string;
  version: string;
}

export interface RunComparison {
  /** ポーリング用の要約（executionSnapshotなし）。runIdsの順。 */
  runs: Run[];
  baselineRunId: string | null;
  /** Runが参照する入力のDatasetVersion（評価データセット）。最初に使われた順。 */
  datasetVersions: ComparedDatasetVersion[];
  /** Runが使ったModelVersion（Run.modelVersionId）。最初に使われた順。 */
  modelVersions: ComparedModelVersion[];
  rows: RunComparisonRow[];
  history?: MetricSeries[];
}
