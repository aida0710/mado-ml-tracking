import { describe, expect, it } from 'vitest';
import { queuedJobWait, workerlessJobGroups } from './queuedJobWait';

const gpu = { id: 'gpu', name: 'GPU機', executor: 'ssh' as const };
const cpu = { id: 'cpu', name: 'CPU機', executor: 'local' as const };
const site = { id: 'site', name: 'Miyabi', executor: 'site' as const };
const onlineOnCpu = {
  targetIds: ['cpu'],
  status: 'online' as const,
  lastSeenAt: '2026-10-11T05:00:00Z',
  capabilities: [],
};
const queued = (targetId: string) => ({
  status: 'queued' as const,
  targetId,
  requiredWorkerCapabilities: [],
});
const workflowStep = (targetId: string) => ({
  ...queued(targetId),
  requiredWorkerCapabilities: ['workflowDatasetUsage' as const],
});

describe('待機中のJobが始まらない理由', () => {
  it('担当するworkerがいなければworkerを、いればworkerがまだ受け取っていないことを理由にする', () => {
    expect(queuedJobWait(queued('gpu'), gpu, [onlineOnCpu])).toEqual({
      kind: 'worker',
      coverage: { state: 'none' },
    });
    expect(queuedJobWait(queued('cpu'), cpu, [onlineOnCpu])).toEqual({
      kind: 'notTaken',
    });
  });

  it('ワークフローのステップのJobは、応答するworkerが対応していなければworkerの更新を理由にする', () => {
    expect(queuedJobWait(workflowStep('cpu'), cpu, [onlineOnCpu])).toEqual({
      kind: 'workerUpdate',
      missingCapabilities: ['workflowDatasetUsage'],
    });
    const updated = { ...onlineOnCpu, capabilities: ['workflowDatasetUsage' as const] };
    expect(queuedJobWait(workflowStep('cpu'), cpu, [onlineOnCpu, updated])).toEqual({
      kind: 'notTaken',
    });
    // An offline updated worker does not take it either: the online one has to be updated.
    const offlineUpdated = { ...updated, status: 'offline' as const };
    expect(queuedJobWait(workflowStep('cpu'), cpu, [onlineOnCpu, offlineUpdated])).toMatchObject({
      kind: 'workerUpdate',
    });
  });

  it('実行中のJob、siteのJob、見えないコンピュータのJobには理由を付けない', () => {
    expect(queuedJobWait({ ...queued('gpu'), status: 'running' as const }, gpu, [])).toBeNull();
    expect(queuedJobWait(queued('site'), site, [])).toBeNull();
    expect(queuedJobWait(queued('gone'), undefined, [])).toBeNull();
  });

  it('workerを待つJobをコンピュータごとに数える', () => {
    const groups = workerlessJobGroups({
      jobs: [
        queued('gpu'),
        queued('cpu'),
        queued('gpu'),
        { ...queued('gpu'), status: 'failed' as const },
      ],
      targets: [gpu, cpu, site],
      workers: [onlineOnCpu],
    });
    expect(groups).toEqual([{ target: gpu, coverage: { state: 'none' }, waitingJobs: 2 }]);
  });
});
