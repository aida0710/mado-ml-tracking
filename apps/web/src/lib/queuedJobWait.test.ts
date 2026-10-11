import { describe, expect, it } from 'vitest';
import { queuedJobWait, workerlessJobGroups } from './queuedJobWait';

const gpu = { id: 'gpu', name: 'GPU機', executor: 'ssh' as const };
const cpu = { id: 'cpu', name: 'CPU機', executor: 'local' as const };
const site = { id: 'site', name: 'Miyabi', executor: 'site' as const };
const onlineOnCpu = { targetIds: ['cpu'], status: 'online' as const, lastSeenAt: '2026-10-11T05:00:00Z' };

describe('待機中のJobが始まらない理由', () => {
  it('担当するworkerがいなければworkerを、いればworkerがまだ受け取っていないことを理由にする', () => {
    expect(queuedJobWait({ status: 'queued', targetId: 'gpu' }, gpu, [onlineOnCpu])).toEqual({
      kind: 'worker',
      coverage: { state: 'none' },
    });
    expect(queuedJobWait({ status: 'queued', targetId: 'cpu' }, cpu, [onlineOnCpu])).toEqual({
      kind: 'notTaken',
    });
  });

  it('実行中のJob、siteのJob、見えないコンピュータのJobには理由を付けない', () => {
    expect(queuedJobWait({ status: 'running', targetId: 'gpu' }, gpu, [])).toBeNull();
    expect(queuedJobWait({ status: 'queued', targetId: 'site' }, site, [])).toBeNull();
    expect(queuedJobWait({ status: 'queued', targetId: 'gone' }, undefined, [])).toBeNull();
  });

  it('workerを待つJobをコンピュータごとに数える', () => {
    const groups = workerlessJobGroups({
      jobs: [
        { status: 'queued', targetId: 'gpu' },
        { status: 'queued', targetId: 'cpu' },
        { status: 'queued', targetId: 'gpu' },
        { status: 'failed', targetId: 'gpu' },
      ],
      targets: [gpu, cpu, site],
      workers: [onlineOnCpu],
    });
    expect(groups).toEqual([{ target: gpu, coverage: { state: 'none' }, waitingJobs: 2 }]);
  });
});
