import { workerInfo } from './workerFixtures.js';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type {
  ComputeTarget,
  Job,
  WorkerJob,
} from '@mmt/contracts';
import { createHarness, entity, request, testDatabaseUrl, type Harness } from './harness.js';
import { executionFixture } from './fixtures.js';

// 競合するリクエストを当て推量の時間だけ遅らせず、PostgreSQLで実際にロック待ちに
// なったことを確かめる。
const MAX_LOCK_OBSERVATIONS = 1000;

describe.skipIf(!testDatabaseUrl)('Computeの編集と有効切替（独立PostgreSQL）', () => {
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

  it('全体管理者だけがtargetを編集し、省略したruntime/GPU設定を維持する', async () => {
    const fixture = await executionFixture(harness);
    const endpoint = `/api/targets/${fixture.target.id}`;
    for (const cookie of [fixture.editor.cookie, fixture.viewer.cookie])
      expect(
        (
          await request(harness.app, endpoint, {
            method: 'PATCH',
            cookie,
            body: { name: 'Forbidden' },
          })
        ).status,
      ).toBe(403);
    const edited = await entity<ComputeTarget>(
      await request(harness.app, endpoint, {
        method: 'PATCH',
        cookie: fixture.administrator.cookie,
        body: { name: 'Renamed', runtimeKinds: ['python', 'docker'], maxConcurrentJobs: 3 },
      }),
      200,
    );
    const renamed = await entity<ComputeTarget>(
      await request(harness.app, endpoint, {
        method: 'PATCH',
        cookie: fixture.administrator.cookie,
        body: { name: 'Again' },
      }),
      200,
    );
    expect(renamed).toMatchObject({
      runtimeKinds: edited.runtimeKinds,
      gpuIds: edited.gpuIds,
      maxConcurrentJobs: 3,
    });
    expect(
      (
        await request(harness.app, endpoint, {
          method: 'PATCH',
          cookie: fixture.administrator.cookie,
          body: { executor: 'ssh' },
        })
      ).status,
    ).toBe(422);
    expect(
      (
        await request(harness.app, endpoint, {
          method: 'PATCH',
          cookie: fixture.administrator.cookie,
          body: { runtimeKinds: ['python', 'python'] },
        })
      ).status,
    ).toBe(422);
    expect(
      (
        await request(harness.app, endpoint, {
          method: 'PATCH',
          cookie: fixture.administrator.cookie,
          body: { host: '--unsafe' },
        })
      ).status,
    ).toBe(422);
    const token = await entity<{ token: string }>(
      await request(harness.app, '/api/tokens', {
        method: 'POST',
        cookie: fixture.administrator.cookie,
        body: { name: 'Jobs only', scopes: ['jobs:write'] },
      }),
    );
    expect(
      (
        await request(harness.app, endpoint, {
          method: 'PATCH',
          token: token.token,
          body: { enabled: false },
        })
      ).status,
    ).toBe(403);
  });

  it('queued/active Jobの接続/runtime/GPUを変更できず、disableは新規claimだけを停止する', async () => {
    const fixture = await executionFixture(harness);
    const jobs: Job[] = [];
    for (const gpuId of ['0', '1']) {
      const run = await fixture.newRun(`Job ${gpuId}`);
      jobs.push(
        await entity<Job>(
          await request(harness.app, `${fixture.basePath}/jobs`, {
            method: 'POST',
            cookie: fixture.editor.cookie,
            body: { runId: run.id, targetId: fixture.target.id, gpuIds: [gpuId] },
          }),
        ),
      );
    }
    const endpoint = `/api/targets/${fixture.target.id}`;
    for (const changes of [
      { host: 'changed.example.test' },
      { runtimeKinds: ['docker'] },
      { gpuIds: ['0'] },
      { pythonExecutable: 'changed' },
    ])
      expect(
        (
          await request(harness.app, endpoint, {
            method: 'PATCH',
            cookie: fixture.administrator.cookie,
            body: changes,
          })
        ).status,
      ).toBe(409);
    const active = (
      await entity<{ item: WorkerJob }>(
        await request(harness.app, '/api/worker/claim', {
          method: 'POST',
          token: fixture.workerToken,
          body: { workerInfo, workerId: 'active-before-disable' },
        }),
        200,
      )
    ).item;
    await entity(
      await request(harness.app, endpoint, {
        method: 'PATCH',
        cookie: fixture.administrator.cookie,
        body: { enabled: false, name: 'Disabled with active Job' },
      }),
      200,
    );
    expect(
      (
        await entity<{ item: WorkerJob | null }>(
          await request(harness.app, '/api/worker/claim', {
            method: 'POST',
            token: fixture.workerToken,
            body: { workerInfo, workerId: 'new-while-disabled' },
          }),
          200,
        )
      ).item,
    ).toBeNull();
    const resumed = await entity<{ items: WorkerJob[] }>(
      await request(harness.app, '/api/worker/resume', {
        method: 'POST',
        token: fixture.workerToken,
        body: { workerInfo, workerId: 'active-before-disable' },
      }),
      200,
    );
    expect(resumed.items[0]!.job.leaseId).toBe(active.job.leaseId);
    expect(resumed.items[0]!.target.enabled).toBe(false);
    await entity(
      await request(harness.app, endpoint, {
        method: 'PATCH',
        cookie: fixture.administrator.cookie,
        body: { enabled: true },
      }),
      200,
    );
    const second = (
      await entity<{ item: WorkerJob }>(
        await request(harness.app, '/api/worker/claim', {
          method: 'POST',
          token: fixture.workerToken,
          body: { workerInfo, workerId: 'second-active' },
        }),
        200,
      )
    ).item;
    expect(
      (
        await request(harness.app, endpoint, {
          method: 'PATCH',
          cookie: fixture.administrator.cookie,
          body: { maxConcurrentJobs: 1 },
        })
      ).status,
    ).toBe(409);
    for (const worker of [active, second])
      await entity(
        await request(harness.app, `/api/worker/jobs/${worker.job.id}/complete`, {
          method: 'POST',
          token: fixture.workerToken,
          body: { leaseId: worker.job.leaseId, status: 'finished', exitCode: 0 },
        }),
        200,
      );
    expect(
      (
        await request(harness.app, endpoint, {
          method: 'PATCH',
          cookie: fixture.administrator.cookie,
          body: { gpuIds: [], maxConcurrentJobs: 1 },
        })
      ).status,
    ).toBe(200);
    expect(jobs.map((job) => job.id).sort()).toEqual([active.job.id, second.job.id].sort());
  });

  it('Job登録transactionのtarget lockを待ってからbusy判定し、古いGPU設定の変更を拒否する', async () => {
    const fixture = await executionFixture(harness);
    const run = await fixture.newRun('Concurrent target edit');
    const connection = await harness.database.connect();
    let patchFinished = false;
    let competing: Promise<Response> | undefined;
    try {
      await connection.query('BEGIN');
      const blockerPid = (await connection.query('SELECT pg_backend_pid() AS pid')).rows[0]
        .pid as number;
      await harness.services.jobs.insertJob(connection, {
        run,
        input: { runId: run.id, targetId: fixture.target.id, gpuIds: ['0'], maxAttempts: 3 },
        attempt: 1,
      });
      competing = request(harness.app, `/api/targets/${fixture.target.id}`, {
        method: 'PATCH',
        cookie: fixture.administrator.cookie,
        body: { gpuIds: ['1'] },
      }).then((response) => {
        patchFinished = true;
        return response;
      });
      let hasLockWaiter = false;
      for (let index = 0; index < MAX_LOCK_OBSERVATIONS && !patchFinished; index++) {
        hasLockWaiter = (
          await harness.database.query(
            'SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE $1=ANY(pg_blocking_pids(pid))) AS waiting',
            [blockerPid],
          )
        ).rows[0].waiting as boolean;
        if (hasLockWaiter) break;
      }
      expect(hasLockWaiter).toBe(true);
      expect(patchFinished).toBe(false);
      await connection.query('COMMIT');
      expect((await competing).status).toBe(409);
      expect(
        (
          await harness.database.query('SELECT gpu_ids FROM compute_targets WHERE id=$1', [
            fixture.target.id,
          ])
        ).rows[0].gpu_ids,
      ).toEqual(['0', '1']);
      expect(
        (await harness.database.query('SELECT gpu_ids FROM jobs WHERE run_id=$1', [run.id])).rows[0]
          .gpu_ids,
      ).toEqual(['0']);
    } finally {
      await connection.query('ROLLBACK');
      connection.release();
      await competing;
    }
  });

  it('重複Job登録はworkerがtargetをロック中でもRun lockを保持して待たずに拒否する', async () => {
    const fixture = await executionFixture(harness);
    const run = await fixture.newRun('Duplicate registration');
    await entity(
      await request(harness.app, `${fixture.basePath}/jobs`, {
        method: 'POST',
        cookie: fixture.editor.cookie,
        body: { runId: run.id, targetId: fixture.target.id },
      }),
    );
    const connection = await harness.database.connect();
    let duplicateFinished = false;
    let duplicate: Promise<Response> | undefined;
    try {
      await connection.query('BEGIN');
      const blockerPid = (await connection.query('SELECT pg_backend_pid() AS pid')).rows[0]
        .pid as number;
      await connection.query('SELECT id FROM compute_targets WHERE id=$1 FOR UPDATE', [
        fixture.target.id,
      ]);
      duplicate = request(harness.app, `${fixture.basePath}/jobs`, {
        method: 'POST',
        cookie: fixture.editor.cookie,
        body: { runId: run.id, targetId: fixture.target.id },
      }).then((response) => {
        duplicateFinished = true;
        return response;
      });
      let hasLockWaiter = false;
      for (let index = 0; index < MAX_LOCK_OBSERVATIONS && !duplicateFinished; index++) {
        hasLockWaiter = (
          await harness.database.query(
            'SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE $1=ANY(pg_blocking_pids(pid))) AS waiting',
            [blockerPid],
          )
        ).rows[0].waiting as boolean;
        if (hasLockWaiter) break;
      }
      expect(hasLockWaiter).toBe(false);
      expect(duplicateFinished).toBe(true);
      expect((await duplicate).status).toBe(409);
    } finally {
      await connection.query('ROLLBACK');
      connection.release();
      await duplicate;
    }
  });
});
