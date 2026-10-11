import { describe, expect, it } from 'vitest';
import type { MetricGroup, MetricSeries as SampledMetricSeries, RunSegment } from '@mmt/contracts';
import {
  groupChartSeries,
  groupSeriesId,
  isSystemMetric,
  nearestPointIndex,
  prepareChartLines,
  resumeMarkers,
  runChartSeries,
  seriesForMetricKeys,
  valuesAtX,
} from './metricSeries';

function sampled(runId: string, key: string, points: SampledMetricSeries['points']) {
  return { runId, key, points, sampled: false, totalPoints: points.length, nanCount: 0, droppedPoints: 0 };
}

describe('APIの系列から図の系列への変換', () => {
  it('指定したkeyの系列をRunごとの線にし、Run名を凡例に使う', () => {
    const series = runChartSeries(
      [
        sampled('a', 'loss', [{ x: 1, step: 1, value: 0.5, min: 0.5, max: 0.5, count: 1 }]),
        sampled('a', 'acc', [{ x: 1, step: 1, value: 0.9, min: 0.9, max: 0.9, count: 1 }]),
        sampled('b', 'loss', [{ x: 2, step: 2, value: 0.4, min: 0.4, max: 0.4, count: 1 }]),
      ],
      'loss',
      { a: 'run A' },
    );
    expect(series).toEqual([
      { id: 'a', label: 'run A', kind: 'run', points: [{ x: 1, value: 0.5 }] },
      { id: 'b', label: 'b', kind: 'run', points: [{ x: 2, value: 0.4 }] },
    ]);
  });

  it('間引かれたbucketだけが最小〜最大の帯を持つ', () => {
    const [series] = runChartSeries(
      [
        sampled('a', 'loss', [
          { x: 1.5, step: 2, value: 0.4, min: 0.1, max: 0.7, count: 2 },
          { x: 3, step: 3, value: 0.2, min: 0.2, max: 0.2, count: 1 },
        ]),
      ],
      'loss',
    );
    expect(series!.points).toEqual([
      { x: 1.5, value: 0.4, min: 0.1, max: 0.7 },
      { x: 3, value: 0.2 },
    ]);
  });

  it('グループは平均を線の値にし、最小〜最大を帯にする', () => {
    const group: MetricGroup = {
      groupKey: '0.01',
      label: 'lr=0.01',
      runIds: ['a', 'b'],
      series: [
        { key: 'loss', points: [{ x: 1, mean: 0.5, min: 0.4, max: 0.6, stddev: 0.1, runCount: 2 }] },
      ],
    };
    expect(groupChartSeries([group], 'loss')).toEqual([
      {
        id: groupSeriesId('0.01'),
        label: 'lr=0.01',
        kind: 'group',
        points: [{ x: 1, value: 0.5, min: 0.4, max: 0.6 }],
      },
    ]);
    expect(groupChartSeries([group], 'acc')[0]!.points).toEqual([]);
  });

  it('system metricsはsystem・gpu・cpu・memoryで始まる名前', () => {
    expect(isSystemMetric('system/gpu_0_utilization_percentage')).toBe(true);
    expect(isSystemMetric('gpu.0.memory')).toBe(true);
    expect(isSystemMetric('loss')).toBe(false);
  });
});

describe('再開位置の目印', () => {
  const segments: RunSegment[] = [
    { startedAt: '2026-10-08T00:00:00Z', endedAt: '2026-10-08T01:00:00Z', endStatus: 'failed', firstStep: null },
    { startedAt: '2026-10-08T02:00:00Z', endedAt: '2026-10-08T03:00:00Z', endStatus: 'failed', firstStep: 501 },
    { startedAt: '2026-10-08T04:00:00Z', endedAt: null, endStatus: null, firstStep: null },
  ];
  const runs = [{ label: '再開', resumeEvents: { items: [], segments } }];

  it('step軸では再開後の最初のstepに置き、metricの無かった区間は置かない', () => {
    expect(resumeMarkers({ kind: 'step' }, runs)).toEqual([{ x: 501, label: '再開' }]);
  });

  it('経過時間の軸ではRun開始からの秒、時刻の軸では再開時刻に置く', () => {
    expect(resumeMarkers({ kind: 'relative_time' }, runs).map((marker) => marker.x)).toEqual([
      7200, 14400,
    ]);
    expect(resumeMarkers({ kind: 'wall_time' }, runs)[0]!.x).toBe(
      Date.parse('2026-10-08T02:00:00Z'),
    );
  });

  it('メトリクスのx軸には再開位置が無いので置かない', () => {
    expect(resumeMarkers({ kind: 'metric', metricKey: 'epoch' }, runs)).toEqual([]);
  });
});

describe('x位置の値', () => {
  const points = [
    { x: 0, value: 1 },
    { x: 10, value: 2 },
    { x: 4, value: 3 },
  ];

  it('並んでいない点からも最も近い点を返す', () => {
    expect(nearestPointIndex(points, 5)).toBe(2);
  });

  it('線のx範囲の外では値を出さない', () => {
    expect(nearestPointIndex(points, 11)).toBeNull();
    expect(nearestPointIndex([], 1)).toBeNull();
  });
});

describe('描く前の系列の準備', () => {
  it('色と線の模様はRun IDから決まり、並べ替えても同じRunは同じになる', () => {
    const run = (id: string) => ({ id, label: id, kind: 'run' as const, points: [] });
    const options = { xScale: 'linear' as const, yScale: 'linear' as const, smoothing: { kind: 'none' as const, weight: 0 }, theme: 'light' as const };
    const forward = prepareChartLines([run('a'), run('b')], options);
    const reversed = prepareChartLines([run('b'), run('a')], options);
    expect(reversed[1]!.color).toBe(forward[0]!.color);
    expect(reversed[1]!.dashPattern).toBe(forward[0]!.dashPattern);
    expect(prepareChartLines([{ ...run('a'), color: '#123456' }], options)[0]!.color).toBe('#123456');
  });

  it('ある指標を記録していないRunがあっても、同じRunは画面のどの図でも同じ色と模様になる', () => {
    const run = (id: string) => ({ id, label: id, kind: 'run' as const, points: [] });
    const options = { xScale: 'linear' as const, yScale: 'linear' as const, smoothing: { kind: 'none' as const, weight: 0 }, theme: 'light' as const, styleIds: ['a', 'b', 'c'] };
    const everyRun = prepareChartLines([run('a'), run('b'), run('c')], options);
    // Run a logged no value of this key, so the chart has only b and c.
    const withoutA = prepareChartLines([run('b'), run('c')], options);
    expect(withoutA.map((line) => [line.color, line.dashPattern])).toEqual(
      everyRun.slice(1).map((line) => [line.color, line.dashPattern]),
    );
  });

  it('画面のRunが8本を超えると、2本だけの図でも同じ色相の色にする', () => {
    const run = (id: string) => ({ id, label: id, kind: 'run' as const, points: [] });
    const styleIds = Array.from({ length: 9 }, (_, index) => `run-${index}`);
    const options = { xScale: 'linear' as const, yScale: 'linear' as const, smoothing: { kind: 'none' as const, weight: 0 }, theme: 'light' as const };
    const fullChart = prepareChartLines(styleIds.map(run), { ...options, styleIds });
    const twoLines = prepareChartLines([run('run-3'), run('run-7')], { ...options, styleIds });
    expect(twoLines.map((line) => line.color)).toEqual([fullChart[3]!.color, fullChart[7]!.color]);
    expect(twoLines.every((line) => line.dashPattern === null)).toBe(true);
  });

  it('画面のRunに無い線（グループ、1つのRunの指標）は、その図の線の中で色を分ける', () => {
    const group = (key: string) => ({ id: `group:${key}`, label: key, kind: 'group' as const, points: [] });
    const options = { xScale: 'linear' as const, yScale: 'linear' as const, smoothing: { kind: 'none' as const, weight: 0 }, theme: 'light' as const };
    const lines = prepareChartLines([group('lr=0.1'), group('lr=0.01')], { ...options, styleIds: ['r1', 'r2'] });
    expect(lines.map((line) => line.color)).toEqual(
      prepareChartLines([group('lr=0.1'), group('lr=0.01')], options).map((line) => line.color),
    );
  });

  it('対数軸に置けない点を除いてから平滑化し、除いた件数を残す', () => {
    const [line] = prepareChartLines(
      [
        {
          id: 'a',
          label: 'A',
          kind: 'run',
          points: [
            { x: 1, value: 1 },
            { x: 2, value: -100 },
            { x: 3, value: 2 },
          ],
        },
      ],
      { xScale: 'linear', yScale: 'log', smoothing: { kind: 'running_average', weight: 1 }, theme: 'light' },
    );
    expect(line!.excludedCount).toBe(1);
    expect(line!.smoothedValues).toEqual([1, 1.5]);
  });
});

describe('tooltipの値', () => {
  const options = { xScale: 'linear' as const, yScale: 'linear' as const, smoothing: { kind: 'none' as const, weight: 0 }, theme: 'light' as const };
  const lines = prepareChartLines(
    ['a', 'b', 'c'].map((id, index) => ({
      id,
      label: id,
      kind: 'run' as const,
      points: [
        { x: 0, value: index },
        { x: 10, value: index + 1 },
      ],
    })),
    options,
  );

  it('値の大きい順に並べ、上限を超えた件数を返す', () => {
    const { rows, hiddenRowCount } = valuesAtX(lines, 9, { highlightedId: null, maxRows: 2 });
    expect(rows.map((row) => [row.id, row.value])).toEqual([
      ['c', 3],
      ['b', 2],
    ]);
    expect(hiddenRowCount).toBe(1);
  });

  it('強調中の系列は値にかかわらず先頭に出す', () => {
    const { rows } = valuesAtX(lines, 9, { highlightedId: 'a', maxRows: 2 });
    expect(rows.map((row) => row.id)).toEqual(['a', 'c']);
  });

  it('平滑化した値には元の値を添える', () => {
    const [smoothed] = prepareChartLines(
      [{ id: 'a', label: 'a', kind: 'run', points: [{ x: 0, value: 0 }, { x: 1, value: 10 }] }],
      { ...options, smoothing: { kind: 'running_average', weight: 1 } },
    );
    expect(valuesAtX([smoothed!], 1, { highlightedId: null, maxRows: 5 }).rows).toEqual([
      { id: 'a', label: 'a', color: smoothed!.color, dashPattern: smoothed!.dashPattern, value: 5, rawValue: 10 },
    ]);
  });
});

describe('値の無いRunの系列', () => {
  it('そのmetricを一度も記録していないRunは線も凡例も作らない', () => {
    const lines = runChartSeries(
      [sampled('train', 'train.accuracy', [{ x: 0, step: 0, value: 0.5, min: 0.5, max: 0.5, count: 1 }]), sampled('eval', 'train.accuracy', [])],
      'train.accuracy',
    );
    expect(lines.map((line) => line.id)).toEqual(['train']);
  });
});

describe('複数のmetricを重ねた図の系列名', () => {
  const lineOf = (runId: string, label: string) => ({ id: runId, label, kind: 'run' as const, points: [] });

  it('Runが1つならmetric名だけを凡例に出し、Run名をくり返さない', () => {
    const lines = seriesForMetricKeys(['train.loss', 'val.loss'], () => [lineOf('r1', 'Run 2')]);
    expect(lines.map((line) => [line.id, line.label])).toEqual([
      ['r1/train.loss', 'train.loss'],
      ['r1/val.loss', 'val.loss'],
    ]);
  });

  it('Runが複数ならmetric名を先にしてRun名を添える', () => {
    const lines = seriesForMetricKeys(['loss', 'acc'], () => [lineOf('r1', 'grid-0'), lineOf('r2', 'grid-1')]);
    expect(lines.map((line) => line.label)).toEqual(['loss · grid-0', 'loss · grid-1', 'acc · grid-0', 'acc · grid-1']);
  });

  it('Runが複数なら、色は元のRunのもの、線の模様はmetricごとにする', () => {
    const series = seriesForMetricKeys(['loss', 'acc'], () => [lineOf('r1', 'grid-0'), lineOf('r2', 'grid-1')]);
    expect(series.map((line) => [line.styleId, line.dashPattern])).toEqual([
      ['r1', null],
      ['r2', null],
      ['r1', '7 4'],
      ['r2', '7 4'],
    ]);
    const options = { xScale: 'linear' as const, yScale: 'linear' as const, smoothing: { kind: 'none' as const, weight: 0 }, theme: 'light' as const, styleIds: ['r1', 'r2'] };
    const runColors = prepareChartLines([lineOf('r1', 'grid-0'), lineOf('r2', 'grid-1')], options).map((line) => line.color);
    expect(prepareChartLines(series, options).map((line) => line.color)).toEqual([...runColors, ...runColors]);
  });

  it('Runが1つなら、metricの線はそれぞれ別の色にする', () => {
    const series = seriesForMetricKeys(['train.loss', 'val.loss'], () => [lineOf('r1', 'Run 2')]);
    expect(series.every((line) => line.styleId === undefined)).toBe(true);
    const options = { xScale: 'linear' as const, yScale: 'linear' as const, smoothing: { kind: 'none' as const, weight: 0 }, theme: 'light' as const, styleIds: ['r1'] };
    expect(new Set(prepareChartLines(series, options).map((line) => line.color)).size).toBe(2);
  });

  it('metricが1つならRunのidと名前をそのまま使う', () => {
    expect(seriesForMetricKeys(['loss'], () => [lineOf('r1', 'grid-0')])).toEqual([lineOf('r1', 'grid-0')]);
  });
});
