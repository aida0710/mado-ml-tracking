// 呼び出し側がaliasもバージョンも指定しないときに比べる相手のalias。
export const DEFAULT_BASELINE_ALIAS = 'production';

// 「参照セット」は、Run.inputDatasetVersionIdsからRun.upstreamDatasetVersionIdsを除いたもの。
// 上流のRunの出力ではなく、固定の評価データ（正解、テスト音声）を指す。
export type EvaluationComparisonStatus =
  | 'ok'
  | 'baseline_missing'
  | 'baseline_not_evaluated'
  | 'candidate_not_evaluated';

// dataset_context: 参照のDatasetVersionのdigestをつけて記録した、MLflowのメトリクスの最新の点。
// run_latest: RunのlatestMetrics。すべてのデータセットのcontextを1つの値にまとめたもの。
export type MetricValueSource = 'dataset_context' | 'run_latest';

// not_finiteはNaNと±Infinityを含む。JSONではこれらを数値として運べない。
export type MetricValueStatus = 'present' | 'missing' | 'not_finite';

export interface MetricComparison {
  key: string;
  candidate: number | null;
  baseline: number | null;
  candidateStatus: MetricValueStatus;
  baselineStatus: MetricValueStatus;
  // candidate − baseline。両方の値があるとき以外はnull。
  delta: number | null;
  // delta ÷ |baseline|。deltaがnullか、baselineが0のときはnull。
  relativeDelta: number | null;
  source: { candidate: MetricValueSource | null; baseline: MetricValueSource | null };
}

export interface EvaluationComparison {
  status: EvaluationComparisonStatus;
  modelId: string;
  candidateVersionId: string;
  // baselineを選んだalias。baselineVersionIdを直接指定したときはnull。
  baselineAlias: string | null;
  baselineVersionId: string | null;
  candidateRunId: string | null;
  baselineRunId: string | null;
  // 両方の評価のRunがそろえるべき条件。決められなかったときは空またはnull。
  referenceDatasetVersionIds: string[];
  codeVersionId: string | null;
  evaluationRuleId: string | null;
  metrics: MetricComparison[];
}
