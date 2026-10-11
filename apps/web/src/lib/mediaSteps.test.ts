import { MEDIA_COMPARE_MAX_STEPS, type RunMedia } from '@mmt/contracts';
import { describe, expect, it } from 'vitest';
import {
  STEP_PAGE_JUMP,
  evenlySpacedSteps,
  gridPositionAfterKey,
  groupMediaByStep,
  handoffPosition,
  nearestStep,
  parseStepParam,
  playbackHandoffFrom,
  stepIndexAfterKey,
} from './mediaSteps';

function media(id: string, step: number, runId = 'run'): RunMedia {
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

describe('stepごとのメディアのstep', () => {
  it('同じstepの複数件をまとめ、stepは昇順に並ぶ', () => {
    const groups = groupMediaByStep([media('c', 200), media('a', 0), media('b', 200)]);
    expect([...groups.keys()]).toEqual([0, 200]);
    expect(groups.get(200)!.map((item) => item.id)).toEqual(['c', 'b']);
  });

  it('記録のあるstepへ吸着し、等距離なら前のstepを選ぶ', () => {
    const steps = [0, 100, 300];
    expect(nearestStep(steps, 120)).toBe(100);
    expect(nearestStep(steps, 200)).toBe(100);
    expect(nearestStep(steps, 260)).toBe(300);
    expect(nearestStep(steps, 5000)).toBe(300);
    expect(nearestStep(steps, 100)).toBe(100);
    expect(nearestStep([], 10)).toBeNull();
  });

  it('キー操作は端で止まり、折り返さない', () => {
    expect(stepIndexAfterKey(3, 0, 'ArrowLeft')).toBe(0);
    expect(stepIndexAfterKey(3, 2, 'ArrowRight')).toBe(2);
    expect(stepIndexAfterKey(3, 1, 'ArrowUp')).toBe(2);
    expect(stepIndexAfterKey(3, 1, 'Home')).toBe(0);
    expect(stepIndexAfterKey(3, 1, 'End')).toBe(2);
    expect(stepIndexAfterKey(100, 50, 'PageUp')).toBe(50 + STEP_PAGE_JUMP);
    expect(stepIndexAfterKey(100, 3, 'PageDown')).toBe(0);
    expect(stepIndexAfterKey(3, 1, 'Enter')).toBeNull();
    expect(stepIndexAfterKey(0, 0, 'ArrowRight')).toBeNull();
  });

  it('均等な列は記録のあるstepだけから選び、両端を含む', () => {
    const steps = Array.from({ length: 101 }, (_, index) => index * 10);
    const picked = evenlySpacedSteps(steps, 5);
    expect(picked).toEqual([0, 250, 500, 750, 1000]);
    expect(picked.every((step) => steps.includes(step))).toBe(true);
    expect(evenlySpacedSteps([30, 10, 20], 5)).toEqual([10, 20, 30]);
    expect(evenlySpacedSteps(steps).length).toBeLessThanOrEqual(MEDIA_COMPARE_MAX_STEPS);
  });
});

describe('聴き比べの再生位置の受け渡し', () => {
  it('次の音声へ同じ位置を渡し、次の音声より先なら最初から再生する', () => {
    expect(handoffPosition(1.25, 3)).toBe(1.25);
    expect(handoffPosition(2.5, 2)).toBe(0);
    expect(handoffPosition(2.5, null)).toBe(2.5);
    expect(handoffPosition(Number.NaN, 3)).toBe(0);
  });

  it('前のプレーヤーの位置と再生中かどうかを取り出す', () => {
    expect(playbackHandoffFrom({ currentTime: 0.8, paused: false })).toEqual({ seconds: 0.8, playing: true });
    expect(playbackHandoffFrom({ currentTime: 0.8, paused: true })).toEqual({ seconds: 0.8, playing: false });
    expect(playbackHandoffFrom(null)).toBeNull();
  });

  it('格子は矢印キーで行と列を移動し、端で止まる', () => {
    const size = { rows: 2, columns: 3 };
    expect(gridPositionAfterKey(size, { row: 0, column: 0 }, 'ArrowDown')).toEqual({ row: 1, column: 0 });
    expect(gridPositionAfterKey(size, { row: 1, column: 0 }, 'ArrowDown')).toEqual({ row: 1, column: 0 });
    expect(gridPositionAfterKey(size, { row: 1, column: 0 }, 'ArrowRight')).toEqual({ row: 1, column: 1 });
    expect(gridPositionAfterKey(size, { row: 1, column: 1 }, 'End')).toEqual({ row: 1, column: 2 });
    expect(gridPositionAfterKey(size, { row: 0, column: 2 }, 'ArrowLeft')).toEqual({ row: 0, column: 1 });
    expect(gridPositionAfterKey(size, { row: 0, column: 0 }, 'a')).toBeNull();
  });
});

describe('URLに残したstep', () => {
  it('stepは0以上の整数だけを受け取り、壊れた値は最新のstepに戻す（null）', () => {
    expect(parseStepParam('29')).toBe(29);
    expect(parseStepParam('0')).toBe(0);
    expect(parseStepParam(null)).toBeNull();
    expect(parseStepParam('-1')).toBeNull();
    expect(parseStepParam('abc')).toBeNull();
  });
});
