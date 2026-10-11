import { describe, expect, it } from 'vitest';
import { summarizeChartLines } from './chartSummary';
import type { ChartLine } from './metricSeries';

const line = (label: string, points: { x: number; value: number }[]): ChartLine => ({
  id: label,
  label,
  kind: 'run',
  color: '#2a78d6',
  dashPattern: null,
  points,
  smoothedValues: points.map((point) => point.value),
  excludedCount: 0,
});

describe('読み上げる図の要約', () => {
  it('線ごとに x が最も大きい値を最新とし、最小と最大を添える', () => {
    const summaries = summarizeChartLines([
      line('loss', [
        { x: 2, value: 0.5 },
        { x: 0, value: 1.2 },
        { x: 5, value: 0.3 },
      ]),
    ]);
    expect(summaries).toEqual([{ label: 'loss', latest: { x: 5, value: 0.3 }, min: 0.3, max: 1.2 }]);
  });

  it('有限の値が無い線は要約に入れない', () => {
    expect(summarizeChartLines([line('nan', [{ x: 0, value: Number.NaN }]), line('empty', [])])).toEqual([]);
  });
});
