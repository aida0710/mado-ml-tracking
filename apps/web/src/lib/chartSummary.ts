import type { ChartLine } from './metricSeries';

/** What a screen reader hears of one line: its last value and its range. */
export interface ChartLineSummary {
  label: string;
  latest: { x: number; value: number };
  min: number;
  max: number;
}

/**
 * The lines in the order drawn, each with its last finite value (the largest x) and the smallest
 * and largest value. Lines without a finite value are left out, as they draw nothing.
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
