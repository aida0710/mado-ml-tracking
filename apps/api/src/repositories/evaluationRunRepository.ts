import { MAX_JOB_ATTEMPTS, type Run } from '@mmt/contracts';
import { first, rows, type Connection } from '../db/database.js';
import type { EvaluatedMetrics } from '../domain/evaluationComparison.js';

export type EvaluationRunRecord = Pick<
  Run,
  | 'id'
  | 'codeVersionId'
  | 'inputDatasetVersionIds'
  | 'upstreamDatasetVersionIds'
  | 'latestMetrics'
  | 'endedAt'
>;

// 参照セット（domain/evaluationInputs.tsを参照）。WHEREで照合できるようSQLで計算する。
const referenceSetExpression = `ARRAY(
  SELECT unnest(r.input_dataset_version_ids) EXCEPT SELECT unnest(r.upstream_dataset_version_ids))`;

/**
 * 別名`r`のRunを、idをプレースホルダ`parameters.ruleId`（例えば'$6'）で渡すルールが作ったときに
 * 成り立つSQL。ルールの実行記録がそのRun、または再試行した元のJobのRunを指していれば成り立つ
 * （automationExecutionLookup.tsのfindExecutionForRunと同じ決まり）。再試行の連なりの長さは
 * `parameters.maxChainLength`までに限る（MAX_JOB_ATTEMPTSを渡す）。
 */
export function runProducedByRuleCondition(parameters: {
  ruleId: string;
  maxChainLength: string;
}): string {
  return `EXISTS (
  WITH RECURSIVE chain(run_id, retry_of_job_id, depth) AS (
    SELECT j.run_id, j.retry_of_job_id, 0 FROM jobs j WHERE j.project_id=r.project_id AND j.run_id=r.id
    UNION ALL
    SELECT previous.run_id, previous.retry_of_job_id, chain.depth + 1
    FROM jobs previous JOIN chain ON previous.id=chain.retry_of_job_id
    WHERE previous.project_id=r.project_id AND chain.depth < ${parameters.maxChainLength}
  )
  SELECT 1 FROM model_automation_executions e
  WHERE e.project_id=r.project_id AND e.rule_id=${parameters.ruleId}::uuid
    AND (e.run_id=r.id OR e.run_id IN (SELECT run_id FROM chain)))`;
}
const producedByRuleExpression = runProducedByRuleCondition({ ruleId: '$6', maxChainLength: '$8' });

/**
 * モデルバージョンの比べられる評価のうち最新のもの。同じProject、kind=evaluation、終了済み、
 * 削除されていないもので、指定があれば同じ参照セット（集合として比べる）、同じ評価のCodeVersion
 * （nullはコードの無いRunに一致）、指定した自動実行ルールが作ったもの（そのJobの手動の再試行も
 * 含む）に限る。ルールで絞ると、昇格のポリシーが手で作った評価のRunを無視できる。runIdを渡すと
 * そのRun1つに絞るので、判定は名指ししたRunそのものを評価する。ended_atの新しいものを選び、
 * 同じならidで決める。
 */
export async function findLatestEvaluationRun(
  connection: Connection,
  filter: {
    projectId: string;
    modelVersionId: string;
    referenceDatasetVersionIds?: readonly string[];
    codeVersionId?: string | null;
    producedByRuleId?: string | null;
    runId?: string;
  },
): Promise<EvaluationRunRecord | undefined> {
  return first<EvaluationRunRecord>(
    connection,
    `SELECT r.id,r.code_version_id,r.input_dataset_version_ids,r.upstream_dataset_version_ids,
      r.latest_metrics,r.ended_at
    FROM runs r
    WHERE r.project_id=$1 AND r.model_version_id=$2
      AND r.kind='evaluation' AND r.status='finished' AND r.lifecycle_stage='active'
      AND ($3::uuid[] IS NULL OR (${referenceSetExpression} @> $3::uuid[] AND ${referenceSetExpression} <@ $3::uuid[]))
      AND (NOT $4::boolean OR r.code_version_id IS NOT DISTINCT FROM $5::uuid)
      AND ($6::uuid IS NULL OR ${producedByRuleExpression})
      AND ($7::uuid IS NULL OR r.id=$7::uuid)
    ORDER BY r.ended_at DESC NULLS LAST, r.id DESC
    LIMIT 1`,
    [
      filter.projectId,
      filter.modelVersionId,
      filter.referenceDatasetVersionIds ? [...filter.referenceDatasetVersionIds] : null,
      filter.codeVersionId !== undefined,
      filter.codeVersionId ?? null,
      filter.producedByRuleId ?? null,
      filter.runId ?? null,
      MAX_JOB_ATTEMPTS,
    ],
  );
}

// PostgreSQLはlatest_metricsを組み立てるとき、有限でないdoubleをJSONの文字列にする。
function parseLatestMetricValue(value: unknown): number | undefined {
  if (typeof value === 'number') return value;
  if (value === 'NaN' || value === 'Infinity' || value === '-Infinity') return Number(value);
  return undefined;
}

/**
 * メトリクスのキーごとに、参照するDatasetVersionのdigestを付けて記録した最新のMLflowの点を
 * 優先する（latest_metricsと同じく、step、次にtimestampで順序を決める）。そうした点の無いキーは、
 * すべてのデータセットの文脈が混ざったRunのlatest_metricsを使う。
 */
export async function loadEvaluationMetrics(
  connection: Connection,
  evaluation: {
    projectId: string;
    run: Pick<EvaluationRunRecord, 'id' | 'latestMetrics'>;
    referenceDatasetVersionIds: readonly string[];
  },
): Promise<EvaluatedMetrics> {
  const contextPoints = await rows<{ name: string; value: number }>(
    connection,
    `SELECT DISTINCT ON (m.name) m.name,m.value
    FROM metrics m
    WHERE m.run_id=$1 AND m.mlflow_dataset_digest IN (
      SELECT d.digest FROM dataset_versions d WHERE d.project_id=$2 AND d.id=ANY($3::uuid[]))
    ORDER BY m.name,m.step DESC,m.timestamp DESC,m.value DESC,m.id DESC`,
    [evaluation.run.id, evaluation.projectId, [...evaluation.referenceDatasetVersionIds]],
  );
  const metrics: Record<string, { value: number; source: 'dataset_context' | 'run_latest' }> = {};
  for (const [key, raw] of Object.entries(evaluation.run.latestMetrics)) {
    const value = parseLatestMetricValue(raw);
    if (value !== undefined) metrics[key] = { value, source: 'run_latest' };
  }
  for (const point of contextPoints)
    metrics[point.name] = { value: Number(point.value), source: 'dataset_context' };
  return metrics;
}
