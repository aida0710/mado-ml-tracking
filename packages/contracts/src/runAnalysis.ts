// Runの集合の分析: 平行座標と散布図のもとになるparameter×メトリクスの表と、parameterの重要度。
// Runの一覧・比較・Sweepの各ページがこれらのエンドポイントを共有する。
import type { JsonValue, RunStatus } from './index.js';
import type { RunSearchRequest } from './runSearch.js';
import type { SweepObjective } from './sweeps.js';

/** ブラウザでの描画と重要度の計算を抑える上限（docs/api-contract.md）。 */
export const ANALYSIS_MAX_RUNS = 5000;
export const ANALYSIS_MAX_PARAMS = 100;
export const ANALYSIS_MAX_METRICS = 50;

/**
 * 取得元はちょうど1つ。`search`はPOST /runs/searchの全ページを読み（アクティブなRunだけ）、
 * `sweepId`は1つのSweepのtrialをtrialの順に読む。
 */
export type RunSet =
  | { runIds: string[] }
  | { search: Omit<RunSearchRequest, 'limit' | 'cursor'> }
  | { sweepId: string };

export interface RunAnalysisTableRequest {
  runSet: RunSet;
  /**
   * 省略時: 値のあるすべてのparameter。それより多ければ、値を持つRunの割合が高い順に
   * ANALYSIS_MAX_PARAMS個。
   */
  params?: string[];
  /** 1からANALYSIS_MAX_METRICS個までのキー。メトリクスの最新の値から読む。 */
  metrics: string[];
}

export interface RunAnalysisRow {
  runId: string;
  name: string;
  experimentId: string;
  status: RunStatus;
  /** RunがSweepのtrialのときにある。 */
  sweepTrialIndex?: number;
  /** 選んだparameterのうち値のあるもの。記録した値（SDK）が実行時のparameterより優先する。 */
  params: Record<string, JsonValue>;
  /** 選んだメトリクスのうちRunが記録したもの。最新の値がNaNか無限大ならnull。 */
  metrics: Record<string, number | null>;
  /** sweepIdの集合のときだけ: trialの集計した目的の値。値が出るまではnull。 */
  objective?: number | null;
}

export type RunAnalysisParamKind = 'numeric' | 'categorical';

export interface RunAnalysisParam {
  key: string;
  /** すべての値が数値か、'1e-4'のような数値の文字列ならnumeric。 */
  kind: RunAnalysisParamKind;
  /** categoricalのときだけ: 異なる値を文字列にしたもの。コード単位の順。 */
  values?: string[];
  /** 値を持つRunの割合。 */
  coverage: number;
}

export interface RunAnalysisRange {
  /** 有限の値を持つRunが無ければnull。 */
  min: number | null;
  max: number | null;
}

export interface RunAnalysisMetric extends RunAnalysisRange {
  key: string;
}

export interface RunAnalysisObjective extends SweepObjective, RunAnalysisRange {}

export interface RunAnalysisTableResponse {
  runs: RunAnalysisRow[];
  params: RunAnalysisParam[];
  metrics: RunAnalysisMetric[];
  /** sweepIdの集合のときだけ。 */
  objective?: RunAnalysisObjective;
}

export interface ParameterImportanceRequest {
  runSet: RunSet;
  /** 説明するメトリクスの最新の値。runSetがSweepでなければ必須（Sweepならその目的の値）。 */
  targetMetric?: string;
  /** 省略時: 表と同じ方法で選ぶ。 */
  params?: string[];
}

export interface ParameterImportanceEntry {
  param: string;
  kind: RunAnalysisParamKind;
  correlation: number | null;
  /** 不純度の減少量。全parameterで合計1になる。Runが少なすぎるときはnull。 */
  importance: number | null;
  /** out-of-bagでのpermutation importance（R²の低下量）。Runが少なすぎるときはnull。 */
  permutationImportance: number | null;
  /** 対象の値があるRunのうち、このparameterを持つRunの割合。 */
  coverage: number;
}

export type ParameterExclusionReason = 'high_cardinality' | 'no_values';
export type ImportanceUnavailableReason = 'too_few_runs';

export interface ParameterImportanceResult {
  targetMetric: string;
  /** latest_metric: Runの最新の値。sweep_objective: trialの集計した目的の値。 */
  targetSource: 'latest_metric' | 'sweep_objective';
  /** 対象の値が有限で、計算に使ったRunの数。 */
  runCount: number;
  /** 対象の値が無いか有限でないRunの数。 */
  skippedRunCount: number;
  /** 重要な順（importanceがnullの間は|correlation|の順）。 */
  entries: ParameterImportanceEntry[];
  excluded: { param: string; reason: ParameterExclusionReason }[];
  importanceUnavailableReason: ImportanceUnavailableReason | null;
  /** フォレストのout-of-bagのR²。重要度をどこまで信頼できるかの目安。 */
  outOfBagR2: number | null;
}
