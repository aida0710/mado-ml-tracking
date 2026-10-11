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
 * Props that connect the chart, analysis, media and comment components of the same release to the
 * pages that place them. Types only: the components live next to their owners.
 */

/** One point of a drawn line. `min`/`max` give the band of a sampled bucket or of a Run group. */
export interface MetricsChartPoint {
  x: number;
  value: number;
  min?: number;
  max?: number;
}

/** `run` is one Run's line; `group` is the mean line of a Run group with its min/max band. */
export interface MetricsChartSeries {
  id: string;
  label: string;
  /**
   * Omitted: lib/seriesColors.ts picks it by the line's style id among `MetricsChartProps.styleIds`
   * (every Run of the page), so a Run has the same color in every chart of the page.
   */
  color?: string;
  /**
   * The Run (or group) whose color and line pattern the line takes; omitted, `id`. The lines of
   * several metric keys of one Run share the Run's color and are told apart by `dashPattern`.
   */
  styleId?: string;
  /** stroke-dasharray that replaces the style's pattern; null for a solid line. */
  dashPattern?: string | null;
  points: MetricsChartPoint[];
  kind: 'run' | 'group';
}

/** A vertical line, such as where a Run was resumed. */
export interface MetricsChartMarker {
  x: number;
  label: string;
}

export interface MetricsChartProps {
  series: MetricsChartSeries[];
  /**
   * The ids whose order assigns colors and line patterns: every Run the page draws, so a Run keeps
   * its style in each chart even where another Run logged nothing, and whether the palette of eight
   * or the hue wheel is used depends on the page, not the chart. Lines whose style id is not among
   * them (Run groups, the metric keys of a single Run) are styled among the chart's own lines.
   */
  styleIds?: readonly string[];
  xAxis: ChartXAxis;
  /** Log x is offered for the step axis; values at or below 0 are left out and counted. */
  xScale?: 'linear' | 'log';
  yScale: 'linear' | 'log';
  /** How the value axis labels its ticks; omitted reads as plain numbers. */
  valueUnit?: ChartValueUnit;
  smoothing: ChartSmoothing;
  showRange: boolean;
  /** Draws the unsmoothed line faintly behind the smoothed one. */
  showRaw: boolean;
  markers?: MetricsChartMarker[];
  /** Pixels. */
  height?: number;
  /**
   * Called with the x interval the user dragged over, or null when the zoom is reset, so the panel
   * can fetch finer buckets for it. The chart narrows its own x domain either way.
   */
  onZoom?: (range: MetricXRange | null) => void;
}

/** The display settings ChartControls edits. The panel owns them and passes them to MetricsChart. */
export type ChartDisplaySettings = Pick<
  MetricsChartProps,
  'xAxis' | 'xScale' | 'yScale' | 'smoothing' | 'showRange' | 'showRaw'
>;

/** One panel of the chart grid: it fetches the series for its config and draws them. */
export interface ChartPanelProps {
  projectId: string;
  config: ChartPanelConfig;
  /** The Runs to draw, unless the config groups Runs (then the group request uses these ids). */
  runIds: string[];
  /** Run names for the legend; a Run without one is shown by id. */
  runLabels?: Record<string, string>;
  /** Whether any of the Runs is still running, so the panel keeps polling. */
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
