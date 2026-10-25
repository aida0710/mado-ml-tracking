/**
 * メトリクスのグラフのパネル。`relative_time`はRunの開始（またはメトリクスの最初の点）からの
 * 秒数、`wall_time`はエポックからのミリ秒、`metric`は同じstepでの`metricKey`の値を使う。
 */
export interface ChartXAxis {
  kind: 'step' | 'relative_time' | 'wall_time' | 'metric';
  metricKey?: string;
}
/** `weight`は選んだ種類の平滑化の強さで、0（平滑化しない）から1まで。 */
export interface ChartSmoothing {
  kind: 'none' | 'ema' | 'gaussian' | 'running_average';
  weight: number;
}
/** `key`はタグかparameterの名前。`experiment`では無い。 */
export interface RunGroupBy {
  kind: 'tag' | 'param' | 'experiment';
  key?: string;
}
export interface ChartPanelConfig {
  id: string;
  title?: string;
  metricKeys: string[];
  xAxis: ChartXAxis;
  yScale: 'linear' | 'log';
  smoothing: ChartSmoothing;
  /** 間引いたバケットか、Runのグループの最小・最大の帯を描く。 */
  showRange: boolean;
  groupBy?: RunGroupBy;
  /** 12列のレイアウトでのグリッドのセル。 */
  layout: { x: number; y: number; w: number; h: number };
}
export interface ChartPanelLayout {
  version: 1;
  columns: 12;
  panels: ChartPanelConfig[];
}
