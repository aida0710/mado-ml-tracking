import type { ChartLine } from './metricSeries';

/** スクリーンリーダーが1本の線について読み上げる内容。最後の値と範囲。 */
export interface ChartLineSummary {
  label: string;
  latest: { x: number; value: number };
  min: number;
  max: number;
}

/**
 * 描いた順の線。それぞれに最後の有限な値（xが最大のもの）と、最小値・最大値を付ける。有限な値の
 * 無い線は何も描かないので除く。
 */
export function summarizeChartLines(lines: readonly ChartLine[]): ChartLineSummary[] {
  return lines.flatMap((line) => {
    let latest: ChartLineSummary['latest'] | null = null;
    let min = Number.POSITIVE_INFINITY;
    let max = Number.NEGATIVE_INFINITY;
    for (const point of line.points) {
      if (!Number.isFinite(point.value)) continue;
      if (!latest || point.x >= latest.x) latest = { x: point.x, value: point.value };
      min = Math.min(min, point.value);
      max = Math.max(max, point.value);
    }
    return latest ? [{ label: line.label, latest, min, max }] : [];
  });
}
