import type {
  ChartSmoothing,
  ChartPanelConfig,
  ChartXAxis,
  CommentTargetType,
  MetricXRange,
  Run,
  RunSet,
} from '@mmt/contracts';
import type { ChartValueUnit } from '../../lib/chartTicks';

/**
 * 同じリリースの図、分析、メディア、コメントの部品と、それらを置くページとをつなぐprops。
 * 型だけを置く。部品自体は持ち主の隣にある。
 */

/** 描く線の1点。`min`/`max`は、間引いたバケットまたはRunのグループの範囲の帯を表す。 */
export interface MetricsChartPoint {
  x: number;
  value: number;
  min?: number;
  max?: number;
}

/** `run`は1つのRunの線。`group`はRunのグループの平均の線で、min/maxの範囲の帯を持つ。 */
export interface MetricsChartSeries {
  id: string;
  label: string;
  /**
   * 省略したときは、lib/seriesColors.tsが`MetricsChartProps.styleIds`（ページの全Run）の中の
   * 線のstyle idから選ぶ。こうしてRunはページのどの図でも同じ色になる。
   */
  color?: string;
  /**
   * 線が色と線種を受け継ぐRun（またはグループ）。省略したときは`id`。1つのRunの複数の
   * メトリクスのキーの線はRunの色を共有し、`dashPattern`で見分ける。
   */
  styleId?: string;
  /** styleの線種の代わりに使うstroke-dasharray。実線ならnull。 */
  dashPattern?: string | null;
  points: MetricsChartPoint[];
  kind: 'run' | 'group';
}

/** 縦線。Runを再開した位置など。 */
export interface MetricsChartMarker {
  x: number;
  label: string;
}

export interface MetricsChartProps {
  series: MetricsChartSeries[];
  /**
   * 並び順で色と線種を割り当てるid。ページが描く全Runを並べる。こうするとRunは、ほかのRunが
   * 何も記録していない図でも同じstyleを保ち、8色のパレットと色相環のどちらを使うかも図でなく
   * ページで決まる。style idがこの中に無い線（Runのグループ、単一のRunのメトリクスのキー）は、
   * 図の中の線どうしでstyleを決める。
   */
  styleIds?: readonly string[];
  xAxis: ChartXAxis;
  /** 対数のx軸はstepの軸にだけ出す。0以下の値は除き、その数を数える。 */
  xScale?: 'linear' | 'log';
  yScale: 'linear' | 'log';
  /** 値の軸の目盛りのラベルの付け方。省略すると普通の数値として読む。 */
  valueUnit?: ChartValueUnit;
  smoothing: ChartSmoothing;
  showRange: boolean;
  /** 平滑化する前の線を、平滑化した線の後ろに薄く描く。 */
  showRaw: boolean;
  markers?: MetricsChartMarker[];
  /** ピクセル。 */
  height?: number;
  /**
   * 利用者がドラッグしたxの区間で呼ぶ。ズームをリセットしたときはnull。パネルがその区間の
   * 細かいバケットを取得できるようにするため。図はどちらにしても自分のxの定義域を狭める。
   */
  onZoom?: (range: MetricXRange | null) => void;
}

/** ChartControlsが編集する表示設定。パネルが持ち、MetricsChartへ渡す。 */
export type ChartDisplaySettings = Pick<
  MetricsChartProps,
  'xAxis' | 'xScale' | 'yScale' | 'smoothing' | 'showRange' | 'showRaw'
>;

/** 図のグリッドの1つのパネル。設定に合う系列を取得して描く。 */
export interface ChartPanelProps {
  projectId: string;
  config: ChartPanelConfig;
  /** 描くRun。ただし設定がRunをグループ化するときは、グループの要求にこのidを使う。 */
  runIds: string[];
  /** 凡例に出すRunの名前。名前の無いRunはidで出す。 */
  runLabels?: Record<string, string>;
  /** まだ実行中のRunがあるかどうか。あればパネルはポーリングを続ける。 */
  live?: boolean;
  onConfigChange?: (config: ChartPanelConfig) => void;
  onRemove?: () => void;
}

export interface RunAnalysisPanelProps {
  projectId: string;
  runSet: RunSet;
}

export interface RunMediaPanelProps {
  projectId: string;
  runId: string;
}

export interface MediaCompareProps {
  projectId: string;
  runIds: string[];
}

export interface CommentThreadProps {
  projectId: string;
  targetType: CommentTargetType;
  targetId: string;
}

export interface RunDescriptionEditorProps {
  projectId: string;
  run: Run;
}
