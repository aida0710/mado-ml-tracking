import { describe, expect, it } from 'vitest';
import { cancelEndsAtOnce } from './jobCancellation';

describe('Jobの停止で起きること', () => {
  it('待機中のJobと、投入中・待ち行列のsiteのJobはすぐに取り消す', () => {
    expect(cancelEndsAtOnce({ status: 'queued', phase: null })).toBe(true);
    expect(cancelEndsAtOnce({ status: 'claimed', phase: 'submitting' })).toBe(true);
    expect(cancelEndsAtOnce({ status: 'claimed', phase: 'submitted' })).toBe(true);
  });

  it('実行中のJobはプロセスへ停止を頼む', () => {
    expect(cancelEndsAtOnce({ status: 'running', phase: null })).toBe(false);
    expect(cancelEndsAtOnce({ status: 'claimed', phase: 'waiting_resources' })).toBe(false);
  });
});
