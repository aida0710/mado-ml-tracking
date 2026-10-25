import { describe, expect, it } from 'vitest';
import { defaultCheckWorker } from './checkWorkerChoice';
import { checkWorker } from '../../tests/fixtures/computerSetup';

const otherWorker = { ...checkWorker, tokenId: 'token-2', workerId: 'cpu-worker' };

describe('接続確認に使うworkerの既定', () => {
  it('オンラインのworkerが1台なら、それを選ぶ', () => {
    expect(defaultCheckWorker([checkWorker], null)).toEqual({
      tokenId: 'token-1',
      workerId: 'gpu-worker',
    });
  });

  it('複数あれば前回の確認のworkerを選び、前回が無いかオフラインなら選ばない', () => {
    const lastUsed = { tokenId: 'token-2', workerId: 'cpu-worker' };
    expect(defaultCheckWorker([checkWorker, otherWorker], lastUsed)).toEqual(lastUsed);
    expect(defaultCheckWorker([checkWorker, otherWorker], null)).toBeNull();
    // 別のtokenで同じMMT_WORKER_IDなら、別のworkerになる。
    expect(
      defaultCheckWorker([checkWorker, otherWorker], { tokenId: 'token-3', workerId: 'cpu-worker' }),
    ).toBeNull();
  });
});
