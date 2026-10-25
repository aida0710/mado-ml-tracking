import type { AutomatedRunSummary, ModelAutomationRule } from '@mmt/contracts';
import { isSystemMetricKey } from './systemMetricKeys';

type EvaluationRun = Pick<
  AutomatedRunSummary,
  | 'id'
  | 'kind'
  | 'status'
  | 'latestMetrics'
  | 'codeVersionId'
  | 'referenceDatasetVersionIds'
  | 'ruleId'
  | 'createdAt'
  | 'endedAt'
>;

export type DeltaSign = 'positive' | 'negative' | 'zero';

export interface MetricValueAt {
  value: number;
  runId: string;
}

export interface MetricSummaryRow {
  metric: string;
  candidate: MetricValueAt | null;
  // 基準バージョンの値。候補の値と同じ評価条件のもの。
  baseline: MetricValueAt | null;
  // 候補 − 基準の符号。大きい方がよいかどうかは昇格policyに任せる。
  deltaSign: DeltaSign | null;
}

export interface EvaluationSummary {
  metricKeys: string[];
  rows: MetricSummaryRow[];
}

// 完了した評価Runだけを対象にする（実行中のRunの最新のメトリクスは、まだ途中の値）。
export function finishedEvaluationRuns<T extends EvaluationRun>(runs: readonly T[]): T[] {
  return runs
    .filter((run) => run.kind === 'evaluation' && run.status === 'finished')
    .sort(compareNewestFirst);
}

function compareNewestFirst(left: EvaluationRun, right: EvaluationRun): number {
  return (
    (right.endedAt ?? '').localeCompare(left.endedAt ?? '') ||
    right.createdAt.localeCompare(left.createdAt) ||
    right.id.localeCompare(left.id)
  );
}

// 同じ評価コードと正解セットを使った評価どうしを、比べられるものとする。APIの基準との比較で
// 一致を求める条件と同じ。
export function evaluationConditionKey(
  run: Pick<EvaluationRun, 'codeVersionId' | 'referenceDatasetVersionIds'>,
): string {
  return JSON.stringify([run.codeVersionId, [...run.referenceDatasetVersionIds].sort()]);
}

// NaNと無限大は比べられないので、別の値に置き換えず、値が無いものとして扱う。
function metricValue(run: EvaluationRun, metric: string): number | null {
  const value: unknown = run.latestMetrics[metric];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/** Runを作った自動実行ルールの要約メトリクス。ルールの順に、重複を除いて並べる。 */
export function collectSummaryMetrics(
  runs: readonly Pick<EvaluationRun, 'ruleId'>[],
  rules: readonly Pick<ModelAutomationRule, 'id' | 'summaryMetrics'>[],
): string[] {
  const ruleIds = new Set(runs.map((run) => run.ruleId).filter((id) => id !== null));
  return [
    ...new Set(
      rules.filter((rule) => ruleIds.has(rule.id)).flatMap((rule) => rule.summaryMetrics),
    ),
  ];
}

/**
 * 要約メトリクスを指定の順で先に並べ、ほかのメトリクス名をアルファベット順で続ける。workerの
 * システムメトリクス（system.cpu.percentなど）は評価ではなくマシンを表すので、ルールが
 * 要約メトリクスに挙げていない限り外す。
 */
export function orderMetricKeys(
  runs: readonly Pick<EvaluationRun, 'latestMetrics'>[],
  summaryMetrics: readonly string[],
): string[] {
  const prioritized = new Set(summaryMetrics);
  const others = new Set(
    runs
      .flatMap((run) => Object.keys(run.latestMetrics))
      .filter((key) => !prioritized.has(key) && !isSystemMetricKey(key)),
  );
  return [...summaryMetrics, ...[...others].sort()];
}

function latestValue(
  runs: readonly EvaluationRun[],
  request: { metric: string; conditionKey?: string },
): (MetricValueAt & { conditionKey: string }) | null {
  for (const run of runs) {
    const conditionKey = evaluationConditionKey(run);
    if (request.conditionKey !== undefined && conditionKey !== request.conditionKey) continue;
    const value = metricValue(run, request.metric);
    if (value !== null) return { value, runId: run.id, conditionKey };
  }
  return null;
}

export function deltaSign(candidate: number, baseline: number): DeltaSign {
  if (candidate > baseline) return 'positive';
  if (candidate < baseline) return 'negative';
  return 'zero';
}

/**
 * メトリクスごとに、それを記録した候補の完了した評価のうち最も新しいものと、同じ条件での基準の
 * 完了した評価のうち最も新しいもの。片方に値の無いメトリクスは空のままにし、ほかの条件から
 * 持ってきたり埋めたりしない。
 */
export function summarizeEvaluations(input: {
  candidateRuns: readonly EvaluationRun[];
  baselineRuns: readonly EvaluationRun[];
  summaryMetrics: readonly string[];
}): EvaluationSummary {
  const candidates = finishedEvaluationRuns(input.candidateRuns);
  const baselines = finishedEvaluationRuns(input.baselineRuns);
  const metricKeys = orderMetricKeys(candidates, input.summaryMetrics);
  const rows = metricKeys.map((metric): MetricSummaryRow => {
    const candidate = latestValue(candidates, { metric });
    const baseline = candidate
      ? latestValue(baselines, { metric, conditionKey: candidate.conditionKey })
      : null;
    return {
      metric,
      candidate: candidate && { value: candidate.value, runId: candidate.runId },
      baseline: baseline && { value: baseline.value, runId: baseline.runId },
      deltaSign: candidate && baseline ? deltaSign(candidate.value, baseline.value) : null,
    };
  });
  return { metricKeys, rows };
}
