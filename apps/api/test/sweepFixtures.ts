import { workerInfo } from './workerFixtures.js';
import type { ComputeTarget, Sweep, SweepTrial, SweepTrialPage, WorkerJob } from '@mmt/contracts';
import { entity, request, type Harness } from './harness.js';
import { workbenchFixture } from './workbenchFixtures.js';

// これらのテストのどのSweepが同時に動かす数よりも多い。そのためclaimがコンピュータの上限で
// 止まることは無い。
const SWEEP_TARGET_MAX_CONCURRENT_JOBS = 10;

/** 並列のtrialをすべて受け付けるCPUのコンピュータでtrialを動かすTask。 */
export async function sweepFixture(harness: Harness) {
  const fixture = await workbenchFixture(harness);
  const target = await entity<ComputeTarget>(
    await request(harness.app, '/api/targets', {
      method: 'POST',
      cookie: fixture.administrator.cookie,
      body: {
        runtimeKinds: ['python'],
        name: 'Sweep target',
        host: '127.0.0.1',
        port: 22,
        username: 'local',
        sshKeyPath: '',
        knownHostsPath: '',
        workDirectory: '/tmp/mmt-test-sweep-worker',
        pythonExecutable: 'python3',
        gpuIds: [],
        maxConcurrentJobs: SWEEP_TARGET_MAX_CONCURRENT_JOBS,
        enabled: true,
        executor: 'local',
        visibility: 'public',
      },
    }),
  );
  const sweepsPath = `${fixture.basePath}/sweeps`;
  let workerCount = 0;

  async function createSweep(body: Record<string, unknown>, cookie = fixture.editor.cookie) {
    return entity<Sweep>(
      await request(harness.app, sweepsPath, {
        method: 'POST',
        cookie,
        body: { taskId: fixture.task.id, targetId: target.id, gpuIds: [], ...body },
      }),
    );
  }

  async function getSweep(sweepId: string): Promise<Sweep> {
    return entity<Sweep>(
      await request(harness.app, `${sweepsPath}/${sweepId}`, { cookie: fixture.viewer.cookie }),
      200,
    );
  }

  async function listTrials(sweepId: string, query = ''): Promise<SweepTrial[]> {
    const page = await entity<SweepTrialPage>(
      await request(harness.app, `${sweepsPath}/${sweepId}/trials${query}`, {
        cookie: fixture.viewer.cookie,
      }),
      200,
    );
    return page.items;
  }

  /** 新しいworkerとして、順番待ちのJobを1つclaimする。claimできるものが無ければnull。 */
  async function claim(): Promise<WorkerJob | null> {
    workerCount += 1;
    const claimed = await entity<{ item: WorkerJob | null }>(
      await request(harness.app, '/api/worker/claim', {
        method: 'POST',
        token: fixture.workerToken,
        body: { workerInfo, workerId: `sweep-worker-${workerCount}` },
      }),
      200,
    );
    return claimed.item;
  }

  async function claimAll(): Promise<WorkerJob[]> {
    const claimed: WorkerJob[] = [];
    for (let item = await claim(); item; item = await claim()) claimed.push(item);
    return claimed;
  }

  async function logMetric(
    claimed: WorkerJob,
    points: { name: string; value: number; step: number }[],
  ): Promise<void> {
    const response = await request(harness.app, `/api/worker/jobs/${claimed.job.id}/metrics`, {
      method: 'POST',
      token: fixture.workerToken,
      body: {
        leaseId: claimed.job.leaseId,
        metrics: points.map((point) => ({ ...point, timestamp: new Date().toISOString() })),
      },
    });
    if (response.status !== 204) throw new Error(`metrics failed with HTTP ${response.status}`);
  }

  async function complete(
    claimed: WorkerJob,
    status: 'finished' | 'failed' | 'canceled' = 'finished',
  ): Promise<void> {
    await entity(
      await request(harness.app, `/api/worker/jobs/${claimed.job.id}/complete`, {
        method: 'POST',
        token: fixture.workerToken,
        body: {
          leaseId: claimed.job.leaseId,
          status,
          ...(status === 'finished' ? { exitCode: 0 } : {}),
        },
      }),
      200,
    );
  }

  return {
    ...fixture,
    sweepTarget: target,
    sweepsPath,
    createSweep,
    getSweep,
    listTrials,
    claim,
    claimAll,
    logMetric,
    complete,
  };
}
