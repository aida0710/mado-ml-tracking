import type {
  ChartSmoothing,
  ChartXAxis,
  MetricGroup,
  MetricSeries,
  RunResumeEventPage,
} from '@mmt/contracts';
import type {
  MetricsChartMarker,
  MetricsChartPoint,
  MetricsChartSeries,
} from '../components/charts/chartProps';
import { keepPlottablePoints, type ChartScale } from './chartScale';
import { smoothValues } from './chartSmoothing';
import { distinctSeriesStyles, metricKeyDashPattern, type ChartTheme } from './seriesColors';

export const isSystemMetric = (name: string) =>
  /^(system[./]|gpu[./]|cpu[./]|memory[./])/.test(name);

/** The id of a group series, kept apart from Run ids so the two never share a color or a key. */
export const groupSeriesId = (groupKey: string) => `group:${groupKey}`;

/**
 * One chart line per Run for `key` from `POST /metrics/series`. A sampled bucket keeps its min/max
 * as the band; a single stored point has none, so showRange draws no zero-width band for it.
 * The API answers every Run and key pair; a Run that never logged the key (an evaluation Run in a
 * panel of training metrics) gets no line, so it does not fill the legend.
 */
export function runChartSeries(
  series: readonly MetricSeries[],
  key: string,
  runLabels: Readonly<Record<string, string>> = {},
): MetricsChartSeries[] {
  return series
    .filter((item) => item.key === key && item.totalPoints > 0)
    .map((item) => ({
      id: item.runId,
      label: runLabels[item.runId] ?? item.runId,
      kind: 'run',
      points: item.points.map(
        (point): MetricsChartPoint =>
          point.min === point.max
            ? { x: point.x, value: point.value }
            : { x: point.x, value: point.value, min: point.min, max: point.max },
      ),
    }));
}

/**
 * The lines of a panel with one or more metric keys. With one key a line is its Run, styled like
 * the Run in every other chart. With several keys each line is a Run (or group) and key pair. When
 * the panel draws one Run, the lines are its keys: named by the key alone, since repeating the
 * Run's name would hide what tells them apart, and each styled on its own. Otherwise a line takes
 * its Run's color and the key's line pattern, and is named key first so a long Run name is what
 * the legend shortens.
 */
export function seriesForMetricKeys(
  keys: readonly string[],
  linesOfKey: (key: string) => MetricsChartSeries[],
): MetricsChartSeries[] {
  const linesByKey = keys.map((key) => ({ key, lines: linesOfKey(key) }));
  if (keys.length <= 1) return linesByKey.flatMap(({ lines }) => lines);
  const sourceCount = new Set(linesByKey.flatMap(({ lines }) => lines.map((line) => line.id))).size;
  return linesByKey.flatMap(({ key, lines }, keyIndex) =>
    lines.map((line): MetricsChartSeries => {
      const id = `${line.id}/${key}`;
      if (sourceCount === 1) return { ...line, id, label: key };
      return {
        ...line,
        id,
        label: `${key} · ${line.label}`,
        styleId: line.styleId ?? line.id,
        dashPattern: metricKeyDashPattern(keyIndex),
      };
    }),
  );
}

/** One mean line with its min/max band per group for `key` from `POST /metrics/groups`. */
export function groupChartSeries(
  groups: readonly MetricGroup[],
  key: string,
): MetricsChartSeries[] {
  return groups.map((group) => ({
    id: groupSeriesId(group.groupKey),
    label: group.label,
    kind: 'group',
    points: (group.series.find((item) => item.key === key)?.points ?? []).map((point) => ({
      x: point.x,
      value: point.mean,
      min: point.min,
      max: point.max,
    })),
  }));
}

/**
 * Where each later running segment of a Run starts on the x axis: the first step logged after the
 * resume on the step axis, the resume time on the time axes. The metric axis has no such position,
 * and a segment that logged no metric has no first step, so neither gets a marker.
 */
export function resumeMarkers(
  xAxis: ChartXAxis,
  runs: readonly { label: string; resumeEvents: RunResumeEventPage }[],
): MetricsChartMarker[] {
  return runs.flatMap(({ label, resumeEvents }) => {
    const runStartedAt = resumeEvents.segments[0]?.startedAt;
    return resumeEvents.segments.slice(1).flatMap((segment): MetricsChartMarker[] => {
      const x = markerX(xAxis, segment, runStartedAt);
      return x === null ? [] : [{ x, label }];
    });
  });
}

function markerX(
  xAxis: ChartXAxis,
  segment: RunResumeEventPage['segments'][number],
  runStartedAt: string | undefined,
): number | null {
  if (xAxis.kind === 'step') return segment.firstStep;
  if (xAxis.kind === 'wall_time') return Date.parse(segment.startedAt);
  if (xAxis.kind === 'relative_time' && runStartedAt)
    return (Date.parse(segment.startedAt) - Date.parse(runStartedAt)) / 1000;
  return null;
}

/**
 * Index of the point nearest to `x`, or null when `x` lies outside the line's x extent (the Run had
 * not reached it yet). Points are scanned in full because the metric x axis is not sorted.
 */
export function nearestPointIndex(points: readonly { x: number }[], x: number): number | null {
  let nearestIndex: number | null = null;
  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  points.forEach((point, index) => {
    if (point.x < minX) minX = point.x;
    if (point.x > maxX) maxX = point.x;
    if (nearestIndex === null || Math.abs(point.x - x) < Math.abs(points[nearestIndex]!.x - x))
      nearestIndex = index;
  });
  return x < minX || x > maxX ? null : nearestIndex;
}

/**
 * A series ready to draw: its color and line pattern, the points the axes can place, and the
 * smoothed values.
 */
export interface ChartLine {
  id: string;
  label: string;
  kind: MetricsChartSeries['kind'];
  color: string;
  /** stroke-dasharray, or null for a solid line. */
  dashPattern: string | null;
  points: MetricsChartPoint[];
  /** One per point; NaN where the value is not finite. Equal to the values without smoothing. */
  smoothedValues: number[];
  /** Points left out because the log axis cannot place them. */
  excludedCount: number;
}

const styleIdOf = (series: MetricsChartSeries) => series.styleId ?? series.id;

/**
 * The ids whose order styles the lines: the page's (`styleIds`) when they hold every line's style
 * id, so a Run is styled the same in each chart of the page; otherwise the chart's own, as for
 * group lines and the metric keys of one Run, which the page's Runs do not name.
 */
function lineStyleIds(
  series: readonly MetricsChartSeries[],
  styleIds: readonly string[] | undefined,
): readonly string[] {
  const ownIds = series.map(styleIdOf);
  if (!styleIds) return ownIds;
  const pageIds = new Set(styleIds);
  return ownIds.every((id) => pageIds.has(id)) ? styleIds : ownIds;
}

/**
 * Prepares the series for drawing. Points a log axis cannot place are dropped first and the rest
 * are smoothed, so a value at or below 0 neither shows nor bends the smoothed line.
 */
export function prepareChartLines(
  series: readonly MetricsChartSeries[],
  options: {
    xScale: ChartScale;
    yScale: ChartScale;
    smoothing: ChartSmoothing;
    theme: ChartTheme;
    /** MetricsChartProps.styleIds. */
    styleIds?: readonly string[];
  },
): ChartLine[] {
  const styles = distinctSeriesStyles(lineStyleIds(series, options.styleIds), options.theme);
  return series.map((item) => {
    const { points, excludedCount } = keepPlottablePoints(item.points, options);
    const style = styles.get(styleIdOf(item))!;
    return {
      id: item.id,
      label: item.label,
      kind: item.kind,
      color: item.color ?? style.color,
      dashPattern: item.dashPattern === undefined ? style.dashPattern : item.dashPattern,
      points,
      smoothedValues: smoothValues(
        points.map((point) => point.value),
        options.smoothing,
      ),
      excludedCount,
    };
  });
}

/** One series' value at the hovered x, for the tooltip. */
export interface ChartValueAtX {
  id: string;
  label: string;
  color: string;
  dashPattern: string | null;
  value: number;
  /** The unsmoothed value, given when smoothing changed it. */
  rawValue?: number;
}

/**
 * The value of each line at `x`, largest first with the highlighted line on top, cut to `maxRows`.
 * `hiddenRowCount` is how many more lines have a value there.
 */
export function valuesAtX(
  lines: readonly ChartLine[],
  x: number,
  options: { highlightedId: string | null; maxRows: number },
): { rows: ChartValueAtX[]; hiddenRowCount: number } {
  const rows = lines.flatMap((line): ChartValueAtX[] => {
    const index = nearestPointIndex(line.points, x);
    if (index === null) return [];
    const value = line.smoothedValues[index]!;
    const rawValue = line.points[index]!.value;
    if (!Number.isFinite(value)) return [];
    return [
      {
        id: line.id,
        label: line.label,
        color: line.color,
        dashPattern: line.dashPattern,
        value,
        ...(rawValue === value ? {} : { rawValue }),
      },
    ];
  });
  rows.sort(
    (left, right) =>
      Number(right.id === options.highlightedId) - Number(left.id === options.highlightedId) ||
      right.value - left.value,
  );
  return {
    rows: rows.slice(0, options.maxRows),
    hiddenRowCount: Math.max(0, rows.length - options.maxRows),
  };
}
