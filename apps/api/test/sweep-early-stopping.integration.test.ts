import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { JobListItem, Run, WorkerJob } from '@mmt/contracts';
import { createHarness, entity, request, testDatabaseUrl, type Harness } from './harness.js';
import { sweepFixture } from './sweepFixtures.js';

describe.skipIf(!testDatabaseUrl)('Sweepの早期打ち切り（独立PostgreSQL）', () => {
  let harness: Harness;
  beforeAll(async () => {
    harness = await createHarness();
  });
  beforeEach(async () => {
    await harness.reset();
  });
  afterAll(async () => {
    await harness?.close();
  });

  it('hyperband eta=3では、rungに達した試行の下位を止め、上位とrung未到達の試行は続ける', async () => {
    const fixture = await sweepFixture(harness);
    const sweep = await fixture.createSweep({
      name: 'hyperband',
      method: 'random',
      searchSpace: { lr: { distribution: 'uniform', min: 0, max: 1 } },
      objective: { metric: 'loss', goal: 'minimize' },
      maxTrials: 4,
      parallelism: 4,
      earlyStopping: { type: 'hyperband', minIter: 2, eta: 3 },
    });
    const claimed = await fixture.claimAll();
    expect(claimed).toHaveLength(4);
    const indexOf = new Map(
      (await fixture.listTrials(sweep.id)).map((trial) => [trial.runId, trial.trialIndex]),
    );
    const byTrial = (trialIndex: number): WorkerJob =>
      claimed.find((item) => indexOf.get(item.run.id) === trialIndex)!;
    // trial 0〜2は最初のrung（step 2）に達し、trial 3はまだstep 1までしか進んでいない。
    for (const [trialIndex, loss] of [
      [0, 0.1],
      [1, 0.5],
      [2, 0.9],
    ] as const)
      await fixture.logMetric(byTrial(trialIndex), [
        { name: 'loss', value: 1, step: 1 },
        { name: 'loss', value: loss, step: 2 },
      ]);
    await fixture.logMetric(byTrial(3), [{ name: 'loss', value: 0.95, step: 1 }]);

    await harness.sweepScheduler.tickAll();

    const trials = await fixture.listTrials(sweep.id);
    expect(trials.map((trial) => [trial.trialIndex, trial.state, trial.jobCancelRequested])).toEqual([
      [0, 'running', false],
      [1, 'early_stopped', true],
      [2, 'early_stopped', true],
      [3, 'running', false],
    ]);
    expect(trials[1]!.stopReason).toBe('hyperband_rung_2');
    for (const trialIndex of [1, 2]) {
      const run = await entity<Run>(
        await request(harness.app, `${fixture.basePath}/runs/${trials[trialIndex]!.runId}`, {
          cookie: fixture.viewer.cookie,
        }),
        200,
      );
      expect(run.tags['mmt.sweepEarlyStopped']).toBe('true');
    }
    const counted = await fixture.getSweep(sweep.id);
    expect(counted.trialCounts).toMatchObject({ running: 2, early_stopped: 2 });

    // workerがプロセスを止める。Runはcanceledになり、trialは目的メトリクスの値を持ったまま
    // early_stoppedで残る。
    await fixture.complete(byTrial(1), 'canceled');
    const stopped = (await fixture.listTrials(sweep.id))[1]!;
    expect(stopped).toMatchObject({
      state: 'early_stopped',
      runStatus: 'canceled',
      objectiveValue: 0.5,
      objectiveStep: 2,
    });

    // Jobの一覧は、早期停止を人による取り消しと区別し、RunとTaskの名前を示す。
    const jobs = await entity<{ items: JobListItem[] }>(
      await request(harness.app, `${fixture.basePath}/jobs`, { cookie: fixture.viewer.cookie }),
      200,
    );
    const jobOf = (trialIndex: number) =>
      jobs.items.find((job) => job.runId === trials[trialIndex]!.runId)!;
    expect(jobOf(1)).toMatchObject({
      status: 'canceled',
      sweepEarlyStopped: true,
      runName: byTrial(1).run.name,
      runKind: byTrial(1).run.kind,
      taskId: byTrial(1).run.taskId,
    });
    expect(jobOf(1).taskName).toEqual(expect.any(String));
    expect(jobOf(0).sweepEarlyStopped).toBe(false);

    // 2回目のtickは、同じtrialをもう一度止めることも、首位のtrialを止めることもしない。
    await harness.sweepScheduler.tickAll();
    expect((await fixture.listTrials(sweep.id)).map((trial) => trial.state)).toEqual([
      'running',
      'early_stopped',
      'early_stopped',
      'running',
    ]);
  });

  it('rungに達した試行がeta未満のうちは止めない', async () => {
    const fixture = await sweepFixture(harness);
    const sweep = await fixture.createSweep({
      name: 'few-peers',
      method: 'random',
      searchSpace: { lr: { distribution: 'uniform', min: 0, max: 1 } },
      objective: { metric: 'loss', goal: 'minimize' },
      maxTrials: 2,
      parallelism: 2,
      earlyStopping: { type: 'hyperband', minIter: 1, eta: 3 },
    });
    const claimed = await fixture.claimAll();
    for (const [index, item] of claimed.entries())
      await fixture.logMetric(item, [{ name: 'loss', value: index, step: 3 }]);
    await harness.sweepScheduler.tickAll();
    const trials = await fixture.listTrials(sweep.id);
    expect(trials.map((trial) => [trial.state, trial.jobCancelRequested])).toEqual([
      ['running', false],
      ['running', false],
    ]);
  });

  it('早期打ち切りを指定しないSweepはschedulerでも止めない', async () => {
    const fixture = await sweepFixture(harness);
    const sweep = await fixture.createSweep({
      name: 'no-early-stopping',
      method: 'random',
      searchSpace: { lr: { distribution: 'uniform', min: 0, max: 1 } },
      objective: { metric: 'loss', goal: 'minimize' },
      maxTrials: 4,
      parallelism: 4,
    });
    const claimed = await fixture.claimAll();
    for (const [index, item] of claimed.entries())
      await fixture.logMetric(item, [{ name: 'loss', value: index, step: 10 }]);
    await harness.sweepScheduler.tickAll();
    const trials = await fixture.listTrials(sweep.id);
    expect(trials.every((trial) => trial.state === 'running' && !trial.jobCancelRequested)).toBe(
      true,
    );
  });
});
