import { ANALYSIS_MAX_METRICS, type ParameterImportanceResult, type RunAnalysisTableResponse } from '@mmt/contracts';
import type { RunAnalysisMetricOptions } from '../api/runAnalysis';
import type { AxisDefinition, ChartRunRow } from './parallelCoordinates';
import { isSystemMetricKey } from './systemMetricKeys';

// 分析の表を、図が描く行と項目に変える。項目のキーはMLflowの検索と同じく
// 名前空間（params./metrics.）を含むので、パラメータとメトリクスが同じ名前でもよい。

export const OBJECTIVE_FIELD_KEY = 'objective';
// 軸がこれより多いと図が混み合う。残りは軸のメニューから表示できる。
export const DEFAULT_PARAM_AXIS_COUNT = 6;

export const paramFieldKey = (key: string) => `params.${key}`;
export const metricFieldKey = (key: string) => `metrics.${key}`;

export function analysisRows(table: RunAnalysisTableResponse): ChartRunRow[] {
  return table.runs.map((run) => {
    const values: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(run.params)) values[paramFieldKey(key)] = value;
    for (const [key, value] of Object.entries(run.metrics)) values[metricFieldKey(key)] = value;
    if (table.objective) values[OBJECTIVE_FIELD_KEY] = run.objective ?? null;
    return { runId: run.runId, name: run.name, values };
  });
}

export function paramFields(table: RunAnalysisTableResponse): AxisDefinition[] {
  return table.params.map((param) => ({
    key: paramFieldKey(param.key),
    label: param.key,
    kind: param.kind,
    ...(param.values ? { categories: param.values } : {}),
  }));
}

export function metricFields(table: RunAnalysisTableResponse, objectiveLabel: string): AxisDefinition[] {
  const metrics: AxisDefinition[] = table.metrics.map((metric) => ({
    key: metricFieldKey(metric.key),
    label: metric.key,
    kind: 'numeric',
  }));
  return table.objective
    ? [{ key: OBJECTIVE_FIELD_KEY, label: `${objectiveLabel} (${table.objective.metric})`, kind: 'numeric' }, ...metrics]
    : metrics;
}

/**
 * 最初に表示するパラメータ。重要度が分かっていれば重要なものから、次に値のあるRunが多いもの
 * （同じなら名前順）。重要度がどれにも順位を付けないこと（対象を持つRunが無い）もあり、その
 * ときも図からパラメータの軸が無くなってはならない。表が返さなかったパラメータは飛ばす。
 */
export function defaultParamAxisKeys(
  table: RunAnalysisTableResponse,
  importance: ParameterImportanceResult | undefined,
): string[] {
  const available = new Set(table.params.map((param) => param.key));
  const important = (importance?.entries ?? [])
    .map((entry) => entry.param)
    .filter((key) => available.has(key));
  const covered = [...table.params]
    .sort((left, right) => right.coverage - left.coverage || left.key.localeCompare(right.key))
    .map((param) => param.key);
  const ranked = [...new Set([...important, ...covered])];
  return ranked.slice(0, DEFAULT_PARAM_AXIS_COUNT).map(paramFieldKey);
}

/**
 * 選択肢に出す順のメトリクス名。結果のメトリクスを名前順に、次にシステムメトリクス（CPU、
 * メモリなど）。システムメトリクスは結果ではなくマシンを表すので、先頭には来ない。
 */
export function orderAnalysisMetricKeys(keys: readonly string[]): string[] {
  const unique = [...new Set(keys)].sort();
  return [...unique.filter((key) => !isSystemMetricKey(key)), ...unique.filter(isSystemMetricKey)];
}

/** 重要度の表が説明する対象。メトリクスの最新の値か、Sweepの集約した目的値。 */
export type AnalysisTarget = { source: 'sweep_objective' } | { source: 'latest_metric'; metric: string };

/** 表のために要求するメトリクス。APIの上限で切られないよう、対象を先頭にする。 */
export function tableMetricKeys(metricKeys: string[], target: AnalysisTarget | null): string[] {
  const targetMetric = target?.source === 'latest_metric' ? target.metric : null;
  const ordered = targetMetric ? [targetMetric, ...metricKeys.filter((key) => key !== targetMetric)] : metricKeys;
  return ordered.slice(0, ANALYSIS_MAX_METRICS);
}

/**
 * Runの集合がまだ選べるうちは選んだ対象、そうでなければ既定の対象。Sweepの目的があればそれ、
 * 次に優先するメトリクス、次に選択肢の最初のメトリクス（システムメトリクスは順の最後）。
 */
export function resolveAnalysisTarget(
  chosen: AnalysisTarget | null,
  options: RunAnalysisMetricOptions,
): AnalysisTarget | null {
  const isOffered =
    chosen?.source === 'sweep_objective'
      ? options.objectiveMetric !== null
      : chosen !== null && options.metricKeys.includes(chosen.metric);
  return isOffered ? chosen : defaultAnalysisTarget(options);
}

function defaultAnalysisTarget(options: RunAnalysisMetricOptions): AnalysisTarget | null {
  if (options.objectiveMetric) return { source: 'sweep_objective' };
  const preferred = options.preferredMetric;
  if (preferred && options.metricKeys.includes(preferred))
    return { source: 'latest_metric', metric: preferred };
  const firstMetric = options.metricKeys[0];
  return firstMetric ? { source: 'latest_metric', metric: firstMetric } : null;
}
