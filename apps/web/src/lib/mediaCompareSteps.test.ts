import { MEDIA_COMPARE_MAX_STEPS, type RunMedia } from '@mmt/contracts';
import { describe, expect, it } from 'vitest';
import {
  LATEST_STEPS_PARAM_VALUE,
  commonSteps,
  compareTableOf,
  defaultComparisonSteps,
  parseStepList,
  parseStepsParam,
  stepCoverage,
  stepsParamOf,
  withStepToggled,
} from './mediaCompareSteps';

function media(id: string, step: number, runId: string): RunMedia {
  return {
    id,
    runId,
    key: 'samples',
    step,
    kind: 'audio',
    artifactId: `artifact-${id}`,
    thumbnailArtifactId: null,
    caption: null,
    metadata: {},
    source: 'native',
    path: `audio/${id}.wav`,
    mimeType: 'audio/wav',
    size: 10,
    contentUrl: `/api/projects/p/artifacts/artifact-${id}/content`,
    thumbnailContentUrl: null,
    createdAt: '2026-10-08T00:00:00Z',
  };
}

// 監査で挙がった例。20 stepのRunは9と19で記録し、60 stepのRunは9から10 stepごとに記録した。
const shortRun = [9, 19];
const longRun = [9, 19, 29, 39, 49, 59];

describe('比較の既定の列', () => {
  it('長さの違うRunを並べると、全Runに共通する最新のstepを1列で出す', () => {
    expect(commonSteps([shortRun, longRun])).toEqual([9, 19]);
    expect(defaultComparisonSteps([shortRun, longRun])).toEqual([19]);
  });

  it('共通するstepが無ければ、各Runの最新step（空の一覧）にする', () => {
    expect(defaultComparisonSteps([[0, 100], [50, 150]])).toEqual([]);
  });

  it('このキーを記録していないRunは、共通するstepの計算から外す', () => {
    expect(defaultComparisonSteps([shortRun, [], longRun])).toEqual([19]);
    expect(defaultComparisonSteps([[], []])).toEqual([]);
  });
});

describe('stepの選択肢', () => {
  it('記録のある全stepを昇順に並べ、それぞれ何件のRunが記録したかを数える', () => {
    expect(stepCoverage([shortRun, longRun, [19, 19]])).toEqual([
      { step: 9, runCount: 2 },
      { step: 19, runCount: 3 },
      { step: 29, runCount: 1 },
      { step: 39, runCount: 1 },
      { step: 49, runCount: 1 },
      { step: 59, runCount: 1 },
    ]);
  });

  it('チェックを付けたstepは昇順に加わり、外すと抜ける', () => {
    expect(withStepToggled([19], 9)).toEqual([9, 19]);
    expect(withStepToggled([9, 19], 19)).toEqual([9]);
    expect(withStepToggled([], 59)).toEqual([59]);
  });
});

describe('URLに残した比較のstep', () => {
  it('stepの一覧は整数の昇順にし、上限を超えたら切り詰めずに断る', () => {
    expect(parseStepList('500, 0、1000 500')).toEqual({ ok: true, steps: [0, 500, 1000] });
    expect(parseStepList('1.5')).toEqual({ ok: false, error: 'invalid' });
    expect(parseStepList('-1')).toEqual({ ok: false, error: 'invalid' });
    const tooMany = Array.from({ length: MEDIA_COMPARE_MAX_STEPS + 1 }, (_, index) => index).join(',');
    expect(parseStepList(tooMany)).toEqual({ ok: false, error: 'too_many' });
  });

  it('無い・壊れた値は既定の列（null）、latest は各Runの最新step（空）として読む', () => {
    expect(parseStepsParam(null)).toBeNull();
    expect(parseStepsParam('9,x')).toBeNull();
    expect(parseStepsParam('')).toBeNull();
    expect(parseStepsParam(LATEST_STEPS_PARAM_VALUE)).toEqual([]);
    expect(parseStepsParam('59,9,29')).toEqual([9, 29, 59]);
  });

  it('選んだstepを書き戻すと、同じ選択として読み直せる', () => {
    for (const steps of [null, [], [9, 29, 59]]) expect(parseStepsParam(stepsParamOf(steps))).toEqual(steps);
  });
});

describe('Run×stepの比較の格子', () => {
  it('stepを指定した応答は、そのstepを列にして並べる', () => {
    const cell = [media('a', 5, 'a')];
    expect(compareTableOf({ key: 'k', steps: [5, 0], rows: [{ runId: 'a', cells: [cell, null] }] })).toEqual({
      runIds: ['a'],
      columns: [
        { kind: 'step', step: 5 },
        { kind: 'step', step: 0 },
      ],
      cells: [[cell, null]],
    });
  });

  it('各Runの最新stepの応答は1列にまとめ、対角に「なし」を並べない', () => {
    const latestA = [media('a3', 3, 'a')];
    const latestB = [media('b2', 2, 'b')];
    expect(
      compareTableOf({
        key: 'k',
        steps: null,
        rows: [
          { runId: 'a', cells: [latestA] },
          { runId: 'b', cells: [latestB] },
          { runId: 'c', cells: [null] },
        ],
      }),
    ).toEqual({
      runIds: ['a', 'b', 'c'],
      columns: [{ kind: 'latest' }],
      cells: [[latestA], [latestB], [null]],
    });
  });

  it('全Runの最新stepが同じなら、その列はそのstepとして出す', () => {
    const table = compareTableOf({
      key: 'k',
      steps: null,
      rows: [
        { runId: 'a', cells: [[media('a2', 2, 'a')]] },
        { runId: 'b', cells: [[media('b2', 2, 'b')]] },
      ],
    });
    expect(table.columns).toEqual([{ kind: 'step', step: 2 }]);
  });
});
