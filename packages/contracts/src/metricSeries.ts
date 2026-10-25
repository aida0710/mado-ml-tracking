import type { ChartXAxis, RunGroupBy } from './chartPanels.js';
import type { RunSearchRequest } from './runSearch.js';

// docs/api-contract.mdで公開している上限。
/** グラフの横幅のピクセル数くらい。線で見せられるのはそれが限度。 */
export const DEFAULT_SERIES_POINTS = 1000;
export const MAX_SERIES_POINTS = 5000;
export const MAX_SERIES_RUNS = 200;
export const MAX_SERIES_KEYS = 50;
export const MAX_GROUPED_RUNS = 1000;
export const MAX_SERIES_GROUPS = 50;
/** グループ分けに使うタグかparameterを持たないRunのラベルとgroupKey。 */
export const RUN_GROUP_NONE = '(none)';

/** 両端を含むxの区間。単位は選んだx軸のもの。 */
export interface MetricXRange {
  min: number;
  max: number;
}
export interface MetricSeriesRequest {
  runIds: string[];
  keys: string[];
  xAxis: ChartXAxis;
  maxPoints?: number;
  xRange?: MetricXRange;
}
/**
 * 保存された1つの点（`count`が1で、`min`=`max`=`value`）か、間引いた系列の1つのバケット。
 * バケットでは、`x`と`value`はその中の有限な点の平均、`step`は最後のstep。
 */
export interface MetricSeriesPoint {
  x: number;
  step: number;
  value: number;
  min: number;
  max: number;
  count: number;
}
export interface MetricSeries {
  runId: string;
  key: string;
  points: MetricSeriesPoint[];
  sampled: boolean;
  /** xの範囲内でxの値を持つ点の数。NaNと無限大の値も含む。 */
  totalPoints: number;
  /** NaNと無限大の値の数。どの点の計算からも除く。 */
  nanCount: number;
  /** xの値を持たない点の数。`metric`軸で、そのstepに`metricKey`の値が無いもの。 */
  droppedPoints: number;
}
export interface MetricSeriesResponse {
  series: MetricSeries[];
}

/** `runIds`と`search`のどちらか一方だけを指定する。`search`には`limit`も`cursor`も付けない。 */
export interface MetricGroupsRequest {
  runIds?: string[];
  search?: Omit<RunSearchRequest, 'limit' | 'cursor'>;
  groupBy: RunGroupBy;
  keys: string[];
  xAxis: ChartXAxis;
  maxPoints?: number;
  xRange?: MetricXRange;
}
/** そのバケットに値を持つRunについて、バケットの平均を集計した統計。 */
export interface MetricGroupPoint {
  x: number;
  mean: number;
  min: number;
  max: number;
  /** 母標準偏差。Runが1つなら0。 */
  stddev: number;
  runCount: number;
}
export interface MetricGroup {
  groupKey: string;
  label: string;
  runIds: string[];
  series: { key: string; points: MetricGroupPoint[] }[];
}
export interface MetricGroupsResponse {
  groups: MetricGroup[];
}
