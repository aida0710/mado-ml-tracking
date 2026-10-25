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

/** グループの系列のid。Runのidと分けておき、両者が色やキーを共有しないようにする。 */
export const groupSeriesId = (groupKey: string) => `group:${groupKey}`;

/**
 * `POST /metrics/series`から作る、`key`のRunごとに1本の図の線。間引いたbucketはmin/maxを帯として
 * 持つ。保存された1点だけのものには帯が無いので、showRangeでも幅0の帯は描かない。APIはRunと
 * キーのすべての組に答えるが、そのキーを記録したことのないRun（学習のメトリクスのパネルにある
 * 評価Run）には線を作らず、凡例を埋めないようにする。
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
 * 1つ以上のメトリクスのキーを持つパネルの線。キーが1つなら線はRunで、ほかのどの図でもそのRunと
 * 同じ見た目にする。キーが複数なら、各線はRun（またはグループ）とキーの組。パネルが1つのRunだけを
 * 描くときは、線はそのRunのキーで、キーだけで名前を付け（Runの名前を繰り返すと、線を見分ける
 * 部分が隠れる）、それぞれ独自の見た目にする。それ以外では、線はRunの色とキーの線種を取り、
 * 名前はキーを先にして、凡例で短くされるのが長いRunの名前の方になるようにする。
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

/** `POST /metrics/groups`から作る、`key`のグループごとに1本の平均の線とmin/maxの帯。 */
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
 * Runの2つ目以降の各実行区間が、x軸のどこから始まるか。stepの軸なら再開の後に最初に記録した
 * step、時間の軸なら再開した時刻。メトリクスの軸にはそうした位置が無く、メトリクスを記録
 * しなかった区間には最初のstepが無いので、どちらにも印を付けない。
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
 * `x`に最も近い点の位置。`x`が線のxの範囲の外にある（Runがまだそこに届いていなかった）ときはnull。
 * メトリクスのx軸は並んでいないので、点はすべて調べる。
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
 * 描ける状態にした系列。色と線種、軸が置ける点、平滑化した値。
 */
export interface ChartLine {
  id: string;
  label: string;
  kind: MetricsChartSeries['kind'];
  color: string;
  /** stroke-dasharray。実線ならnull。 */
  dashPattern: string | null;
  points: MetricsChartPoint[];
  /** 点ごとに1つ。値が有限でない所はNaN。平滑化しないときは値と同じ。 */
  smoothedValues: number[];
  /** 対数軸に置けないため除いた点。 */
  excludedCount: number;
}

const styleIdOf = (series: MetricsChartSeries) => series.styleId ?? series.id;

/**
 * 線の見た目を決める順のid。ページのもの（`styleIds`）がすべての線のstyle idを含むならそれを使い、
 * 同じRunはページのどの図でも同じ見た目にする。そうでなければ図自身のものを使う。グループの線や
 * 1つのRunのメトリクスのキーがそれに当たり、これらはページのRunに含まれない。
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
 * 系列を描ける状態にする。対数軸に置けない点を先に除いてから残りを平滑化し、0以下の値が表示される
 * ことも、平滑化した線を曲げることもないようにする。
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

/** ツールチップに出す、ポインタを合わせたxでの1つの系列の値。 */
export interface ChartValueAtX {
  id: string;
  label: string;
  color: string;
  dashPattern: string | null;
  value: number;
  /** 平滑化する前の値。平滑化で値が変わったときに付ける。 */
  rawValue?: number;
}

/**
 * `x`での各線の値。大きい順に並べ、強調した線を一番上にして、`maxRows`で切る。
 * `hiddenRowCount`は、そこに値を持つ残りの線の数。
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
