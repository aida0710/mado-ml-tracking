import type { MetricSeriesPoint, MetricXRange } from '@mmt/contracts';

/** 1つの系列、またはRunをまたいだ1つのkeyのx値が、要求された範囲のどこにあるか。 */
export interface SeriesExtent {
  xMin: number | null;
  xMax: number | null;
  /** x値を持つ点の数。NaNや無限大の値も含む。 */
  totalPoints: number;
}
/**
 * `raw`は保存されたすべての点を返す。`buckets`は[lower, upper]を`count`個の等しい幅に分ける。
 */
export type BucketPlan =
  | { kind: 'raw' }
  | { kind: 'buckets'; lower: number; upper: number; count: number };
/** NaNだけのバケットを除く前の、SQLの1バケット。そうしたバケットでは有限値の統計はnull。 */
export interface SeriesBucketRow {
  x: number | null;
  step: number | null;
  value: number | null;
  minValue: number | null;
  maxValue: number | null;
  count: number;
  nanCount: number;
}

// width_bucketには異なる上下限が要る。x値が1つだけ（stepが1つ、または1点のxRange）でも、
// それを含むバケットが要り、正の幅ならどれでも最初のバケットに入る。
const SINGLE_VALUE_BUCKET_WIDTH = 1;

/** データより要求された範囲を優先し、拡大したときにバケットが細かくなるようにする。 */
export function bucketBounds(
  extent: SeriesExtent,
  xRange: MetricXRange | null,
): { lower: number; upper: number } | null {
  const lower = xRange?.min ?? extent.xMin;
  const upper = xRange?.max ?? extent.xMax;
  if (lower === null || upper === null) return null;
  return upper > lower ? { lower, upper } : { lower, upper: lower + SINGLE_VALUE_BUCKET_WIDTH };
}

/** 1つのRunの系列は、グラフが表示できるより点が多いときだけ間引く。 */
export function planSeriesBuckets(
  extent: SeriesExtent,
  options: { maxPoints: number; xRange: MetricXRange | null },
): BucketPlan | null {
  if (extent.totalPoints === 0) return null;
  if (extent.totalPoints <= options.maxPoints) return { kind: 'raw' };
  const bounds = bucketBounds(extent, options.xRange);
  return bounds && { kind: 'buckets', ...bounds, count: options.maxPoints };
}

/**
 * グループのRunは常に、そのkeyのすべてのRunで共通の上下限でバケットに分ける。これで、1つの
 * バケットはどのRunでもどのグループでも同じxの区間を表す。
 */
export function planSharedBuckets(
  extent: SeriesExtent,
  options: { maxPoints: number; xRange: MetricXRange | null },
): Extract<BucketPlan, { kind: 'buckets' }> | null {
  if (extent.totalPoints === 0) return null;
  const bounds = bucketBounds(extent, options.xRange);
  return bounds && { kind: 'buckets', ...bounds, count: options.maxPoints };
}

/** NaNか無限大の値しか無かったバケットを除き、その値の数を合計する。 */
export function assembleSeriesPoints(rows: SeriesBucketRow[]): {
  points: MetricSeriesPoint[];
  nanCount: number;
} {
  const points: MetricSeriesPoint[] = [];
  let nanCount = 0;
  for (const row of rows) {
    nanCount += row.nanCount;
    if (row.count === 0) continue;
    points.push({
      x: row.x!,
      step: row.step!,
      value: row.value!,
      min: row.minValue!,
      max: row.maxValue!,
      count: row.count,
    });
  }
  return { points, nanCount };
}
