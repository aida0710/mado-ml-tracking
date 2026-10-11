import { describe, expect, it } from 'vitest';
import { applyLaunchFormChange } from './launchFormChanges';

const filled = {
  kind: 'training',
  modelVersionId: 'model-1',
  codeVersionId: 'train-code',
  targetId: 'gpu-host',
  gpuIds: ['0'],
};
const fitsEverything = { isCodeAllowed: () => true, isTargetAllowed: () => true };

describe('ジョブを起動する画面の入力の変更', () => {
  it('種別を変えても、コードがその種別に合えば選んだものを残す', () => {
    const change = applyLaunchFormChange({
      previous: filled,
      next: { ...filled, kind: 'finetuning' },
      ...fitsEverything,
    });
    expect(change.values).toMatchObject({ codeVersionId: 'train-code', targetId: 'gpu-host' });
    expect(change.cleared).toEqual([]);
  });

  it('合わなくなったコードを外し、外したことを返す。コンピュータはRuntimeに合う限り残す', () => {
    const change = applyLaunchFormChange({
      previous: filled,
      next: { ...filled, kind: 'inference' },
      isCodeAllowed: () => false,
      isTargetAllowed: () => true,
    });
    expect(change.values.codeVersionId).toBe('');
    expect(change.values.targetId).toBe('gpu-host');
    expect(change.cleared).toEqual(['codeVersion']);
  });

  it('コードのRuntimeが無いコンピュータはGPUごと外す', () => {
    const change = applyLaunchFormChange({
      previous: filled,
      next: { ...filled, codeVersionId: 'docker-code' },
      isCodeAllowed: () => true,
      isTargetAllowed: () => false,
    });
    expect(change.values).toMatchObject({ targetId: '', gpuIds: [] });
    expect(change.cleared).toEqual(['target']);
  });

  it('コンピュータを変えると、前のコンピュータのGPUを外す', () => {
    const change = applyLaunchFormChange({
      previous: filled,
      next: { ...filled, targetId: 'other-host' },
      ...fitsEverything,
    });
    expect(change.values.gpuIds).toEqual([]);
    expect(change.cleared).toEqual(['gpus']);
  });
});
