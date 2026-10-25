import type { MetricXRange, RunGroupBy } from '@mmt/contracts';
import { rows, type Connection } from '../db/database.js';
import type { MetricXAxis } from '../domain/metricSeries/metricSeriesValidation.js';
import type { RunGroupValue } from '../domain/metricSeries/runGrouping.js';
import type {
  BucketPlan,
  SeriesBucketRow,
  SeriesExtent,
} from '../domain/metricSeries/seriesBuckets.js';

// グラフのリクエストは対話的なので、これより遅い集計はリクエストが大きすぎて応じられないとみなす。
const SERIES_QUERY_TIMEOUT_MS = 10000;
// MLflowはNaNと無限大を保存する。PostgreSQLはNaNをNaN自身と等しいとみなすので、NOT INで判定できる。
const finiteValue = (column: string) =>
  `${column} NOT IN ('NaN'::float8,'Infinity'::float8,'-Infinity'::float8)`;
// Run検索のコンパイラと同じ合わせ方。SDKで記録したparameterを実行時のparameterより優先する。
const RUN_PARAMETERS_SQL = '(r.parameters||r.recorded_parameters)';

/** バケットに分ける前に、保存したどの点を読むか。 */
export interface MetricPointSelection {
  runIds: string[];
  keys: string[];
  xAxis: MetricXAxis;
  xRange: MetricXRange | null;
}
export interface RunSeriesExtent extends SeriesExtent {
  runId: string;
  name: string;
  droppedPoints: number;
}
export interface RunSeriesBucketRow extends SeriesBucketRow {
  runId: string;
  name: string;
}
export interface GroupBucketRow {
  groupIndex: number;
  name: string;
  x: number;
  mean: number;
  minValue: number;
  maxValue: number;
  stddev: number;
  runCount: number;
}
type BucketsPlan = Extract<BucketPlan, { kind: 'buckets' }>;

class SqlParameters {
  readonly values: unknown[] = [];
  bind(value: unknown): string {
    return `$${this.values.push(value)}`;
  }
}

function xExpression(xAxis: MetricXAxis): string {
  switch (xAxis.kind) {
    case 'step':
      return 'm.step::float8';
    // date_partはfloat8をそのまま返す。EXTRACTはnumericを返し、測ると1.4〜1.8倍遅かった。
    case 'wall_time':
      return "date_part('epoch',m.timestamp)*1000";
    case 'relative_time':
      return "date_part('epoch',m.timestamp-ro.origin)";
    case 'metric':
      // NaNのxは軸に置けないので、欠損として数える。
      return `CASE WHEN ${finiteValue('xv.value')} THEN xv.value END`;
  }
}

/** `WITH ... points AS (id, run_id, name, step, value, x)`。点にxが無いときはNULL。 */
function pointsCte(selection: MetricPointSelection, parameters: SqlParameters): string {
  const runIds = parameters.bind(selection.runIds);
  const keys = parameters.bind(selection.keys);
  const ctes: string[] = [];
  let join = '';
  if (selection.xAxis.kind === 'relative_time') {
    // COALESCEは、開始しなかったRunに限ってサブクエリを評価する。インラインにすると、プランナーは
    // そのサブクエリをメトリクスの点ごとに実行した（10万点で数分）。そこで起点はRunごとに1回だけ
    // 計算する。
    ctes.push(`run_origins AS MATERIALIZED (SELECT r.id AS run_id,
      COALESCE(r.started_at,(SELECT min(o.timestamp) FROM metrics o WHERE o.run_id=r.id)) AS origin
      FROM runs r WHERE r.id=ANY(${runIds}::uuid[]))`);
    join = 'JOIN run_origins ro ON ro.run_id=m.run_id';
  }
  if (selection.xAxis.kind === 'metric') {
    // 同じ理由でMATERIALIZEDにする。xはRunとstepごとに1つで、1回だけ読む。
    ctes.push(`x_values AS MATERIALIZED (SELECT DISTINCT ON(run_id,step) run_id,step,value FROM metrics
      WHERE run_id=ANY(${runIds}::uuid[]) AND name=${parameters.bind(selection.xAxis.metricKey)}
      ORDER BY run_id,step,timestamp DESC,id DESC)`);
    join = 'LEFT JOIN x_values xv ON xv.run_id=m.run_id AND xv.step=m.step';
  }
  const range = selection.xRange
    ? `WHERE p.x IS NULL OR p.x BETWEEN ${parameters.bind(selection.xRange.min)} AND ${parameters.bind(selection.xRange.max)}`
    : '';
  ctes.push(`points AS (SELECT * FROM (
    SELECT m.id,m.run_id,m.name,m.step,m.value,${xExpression(selection.xAxis)} AS x
    FROM metrics m ${join} WHERE m.run_id=ANY(${runIds}::uuid[]) AND m.name=ANY(${keys}::text[])
  ) p ${range})`);
  return `WITH ${ctes.join(',')}`;
}

function bucketExpression(plan: string): string {
  // width_bucketは上限と等しいxをcount+1に入れるが、それは最後のバケットに属する。
  return `LEAST(width_bucket(p.x,${plan}.lower_bound,${plan}.upper_bound,${plan}.bucket_count),${plan}.bucket_count)`;
}

/** すべての系列を1つのスナップショットで読み、1文ごとにSERIES_QUERY_TIMEOUT_MSで諦める。 */
export async function beginSeriesSnapshot(connection: Connection): Promise<void> {
  await connection.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
  await connection.query(`SET LOCAL statement_timeout=${SERIES_QUERY_TIMEOUT_MS}`);
}

export function isSeriesQueryTimeout(error: unknown): boolean {
  // query_canceled。statement_timeoutが切れたときに起きる。
  return (error as { code?: string }).code === '57014';
}

export async function findProjectRunIds(
  connection: Connection,
  runs: { projectId: string; runIds: string[] },
): Promise<string[]> {
  const found = await rows<{ id: string }>(
    connection,
    'SELECT id FROM runs WHERE project_id=$1 AND id=ANY($2::uuid[])',
    [runs.projectId, runs.runIds],
  );
  return found.map((run) => run.id);
}

/** そのProjectのRunだけを返すので、行が無ければ別のProjectのRunか、Runが存在しない。 */
export async function readRunGroupValues(
  connection: Connection,
  runs: { projectId: string; runIds: string[]; groupBy: RunGroupBy },
): Promise<RunGroupValue[]> {
  const { groupBy } = runs;
  const parameters = [runs.projectId, runs.runIds];
  if (groupBy.kind === 'experiment')
    return rows<RunGroupValue>(
      connection,
      `SELECT r.id AS run_id,r.experiment_id::text AS value,e.name AS label
      FROM runs r JOIN experiments e ON e.id=r.experiment_id
      WHERE r.project_id=$1 AND r.id=ANY($2::uuid[])`,
      parameters,
    );
  const values = groupBy.kind === 'param' ? RUN_PARAMETERS_SQL : 'r.tags';
  return rows<RunGroupValue>(
    connection,
    `SELECT r.id AS run_id,${values}->>$3::text AS value FROM runs r
    WHERE r.project_id=$1 AND r.id=ANY($2::uuid[])`,
    [...parameters, groupBy.key],
  );
}

export async function readSeriesExtents(
  connection: Connection,
  selection: MetricPointSelection,
): Promise<RunSeriesExtent[]> {
  const parameters = new SqlParameters();
  return rows<RunSeriesExtent>(
    connection,
    `${pointsCte(selection, parameters)}
    SELECT run_id,name,min(x) AS x_min,max(x) AS x_max,count(x)::int AS total_points,
      (count(*)-count(x))::int AS dropped_points
    FROM points GROUP BY run_id,name`,
    parameters.values,
  );
}

/** rawの計画では点のIDでまとめるので、その行は保存した点そのものになる。 */
export async function readSeriesBuckets(
  connection: Connection,
  query: {
    selection: MetricPointSelection;
    plans: { runId: string; name: string; plan: BucketPlan }[];
  },
): Promise<RunSeriesBucketRow[]> {
  if (!query.plans.length) return [];
  const parameters = new SqlParameters();
  const points = pointsCte(query.selection, parameters);
  const column = <T>(read: (plan: BucketPlan) => T) => query.plans.map(({ plan }) => read(plan));
  const plans = [
    parameters.bind(query.plans.map((series) => series.runId)),
    parameters.bind(query.plans.map((series) => series.name)),
    parameters.bind(column((plan) => (plan.kind === 'buckets' ? plan.lower : null))),
    parameters.bind(column((plan) => (plan.kind === 'buckets' ? plan.upper : null))),
    parameters.bind(column((plan) => (plan.kind === 'buckets' ? plan.count : 0))),
  ];
  const finite = finiteValue('p.value');
  return rows<RunSeriesBucketRow>(
    connection,
    `${points},plans AS (SELECT * FROM unnest(${plans[0]}::uuid[],${plans[1]}::text[],${plans[2]}::float8[],${plans[3]}::float8[],${plans[4]}::int[])
      AS plan(run_id,name,lower_bound,upper_bound,bucket_count))
    SELECT p.run_id,p.name,
      avg(p.x) FILTER (WHERE ${finite}) AS x,
      max(p.step) FILTER (WHERE ${finite})::float8 AS step,
      avg(p.value) FILTER (WHERE ${finite}) AS value,
      min(p.value) FILTER (WHERE ${finite}) AS min_value,
      max(p.value) FILTER (WHERE ${finite}) AS max_value,
      count(*) FILTER (WHERE ${finite})::int AS count,
      count(*) FILTER (WHERE NOT ${finite})::int AS nan_count
    FROM points p JOIN plans pl ON pl.run_id=p.run_id AND pl.name=p.name
    WHERE p.x IS NOT NULL
    GROUP BY p.run_id,p.name,CASE WHEN pl.bucket_count=0 THEN p.id ELSE ${bucketExpression('pl')} END
    ORDER BY p.run_id,p.name,x,step`,
    parameters.values,
  );
}

/** 選んだすべてのRunにわたる各キーのxの範囲。グループ間で共有するバケットの境界に使う。 */
export async function readKeyExtents(
  connection: Connection,
  selection: MetricPointSelection,
): Promise<(SeriesExtent & { name: string })[]> {
  const parameters = new SqlParameters();
  return rows<SeriesExtent & { name: string }>(
    connection,
    `${pointsCte(selection, parameters)}
    SELECT name,min(x) AS x_min,max(x) AS x_max,count(x)::int AS total_points
    FROM points GROUP BY name`,
    parameters.values,
  );
}

/**
 * まずバケットの中でRunごとに平均し、そのRunの平均値をまたいで統計を取る。記録の多いRunがほかの
 * Runより重く数えられないようにするため。バケットに有限の値が無いRunは、そのバケットでは数えない。
 */
export async function readGroupBuckets(
  connection: Connection,
  query: {
    selection: MetricPointSelection;
    plans: { name: string; plan: BucketsPlan }[];
    memberships: { runId: string; groupIndex: number }[];
  },
): Promise<GroupBucketRow[]> {
  if (!query.plans.length || !query.memberships.length) return [];
  const parameters = new SqlParameters();
  const points = pointsCte(query.selection, parameters);
  const plans = [
    parameters.bind(query.plans.map((series) => series.name)),
    parameters.bind(query.plans.map((series) => series.plan.lower)),
    parameters.bind(query.plans.map((series) => series.plan.upper)),
    parameters.bind(query.plans.map((series) => series.plan.count)),
  ];
  const memberships = [
    parameters.bind(query.memberships.map((membership) => membership.runId)),
    parameters.bind(query.memberships.map((membership) => membership.groupIndex)),
  ];
  return rows<GroupBucketRow>(
    connection,
    `${points},plans AS (SELECT * FROM unnest(${plans[0]}::text[],${plans[1]}::float8[],${plans[2]}::float8[],${plans[3]}::int[])
      AS plan(name,lower_bound,upper_bound,bucket_count)),
    memberships AS (SELECT * FROM unnest(${memberships[0]}::uuid[],${memberships[1]}::int[])
      AS membership(run_id,group_index)),
    run_buckets AS (
      SELECT p.run_id,p.name,${bucketExpression('pl')} AS bucket,avg(p.x) AS x,avg(p.value) AS value
      FROM points p JOIN plans pl ON pl.name=p.name
      WHERE p.x IS NOT NULL AND ${finiteValue('p.value')}
      GROUP BY p.run_id,p.name,bucket)
    SELECT ms.group_index,rb.name,avg(rb.x) AS x,avg(rb.value) AS mean,
      min(rb.value) AS min_value,max(rb.value) AS max_value,stddev_pop(rb.value) AS stddev,
      count(*)::int AS run_count
    FROM run_buckets rb JOIN memberships ms ON ms.run_id=rb.run_id
    GROUP BY ms.group_index,rb.name,rb.bucket
    ORDER BY ms.group_index,rb.name,x`,
    parameters.values,
  );
}
