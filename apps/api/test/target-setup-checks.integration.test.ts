import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type {
  ComputeTarget,
  TargetCheck,
  TargetCheckResult,
  TargetCheckWorker,
  TargetCheckWorkerPresence,
  TargetDirectoryListing,
  TargetDirectoryListingResult,
  WorkerPresence,
  WorkerSshFiles,
  WorkerTargetCheck,
} from '@mmt/contracts';
import { createHarness, entity, request, testDatabaseUrl, type Harness } from './harness.js';
import { executionFixture } from './fixtures.js';

const WORKER_SSH_FILES: WorkerSshFiles = {
  keyPaths: ['/home/worker/.ssh/id_ed25519', '/home/worker/.ssh/gpu.pem'],
  knownHostsPaths: ['/home/worker/.ssh/known_hosts'],
};
const SSH_KEY_PATH = '/home/worker/.ssh/id_ed25519';

const setupResult: TargetCheckResult = {
  version: 2,
  items: [
    { name: 'connection', status: 'ok', code: null, detail: null },
    { name: 'python', status: 'ok', code: null, detail: '3.12.3 /usr/bin/python3' },
    { name: 'work_directory', status: 'skipped', code: 'work_directory_not_set', detail: null },
  ],
  gpus: [
    { index: '0', uuid: 'GPU-aaaa', name: 'NVIDIA H100 80GB HBM3', memoryTotalMiB: 81559 },
    { index: '1', uuid: 'GPU-bbbb', name: 'NVIDIA H100 80GB HBM3', memoryTotalMiB: 81559 },
  ],
  runtimeKinds: ['python', 'docker'],
  workDirectoryFreeBytes: null,
  host: {
    machine: 'x86_64',
    cpuArch: 'amd64',
    cpuCount: 64,
    memoryTotalBytes: 540_000_000_000,
    homeDirectory: '/home/mmt',
  },
  pythons: [
    { path: '/usr/bin/python3', version: '3.12.3' },
    { path: '/home/mmt/miniconda3/envs/train/bin/python', version: '3.11.9' },
  ],
  directories: [
    { path: '/home/mmt', source: 'home', writable: true, freeBytes: 1_000_000_000 },
    { path: '/large', source: 'mount', writable: true, freeBytes: 9_000_000_000_000 },
  ],
};

const listingResult: TargetDirectoryListingResult = {
  path: '/home/mmt/projects',
  outcome: 'ok',
  entries: [
    { name: 'mmt-work', kind: 'directory', executable: true },
    { name: 'run.sh', kind: 'file', executable: true },
  ],
  truncated: false,
};

describe.skipIf(!testDatabaseUrl)('コンピュータの追加の接続確認とディレクトリの読み取り（独立PostgreSQL）', () => {
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

  async function issueWorkerToken(cookie: string, projectId: string) {
    return entity<{ token: string; item: { id: string } }>(
      await request(harness.app, '/api/tokens', {
        method: 'POST',
        cookie,
        body: { name: 'Setup Worker', kind: 'service', projectId, scopes: ['worker:execute'] },
      }),
    );
  }

  /** A worker reports itself (and its SSH files) with its Job claim, as the worker loop does. */
  async function reportPresence(token: string, workerId: string, sshFiles?: WorkerSshFiles) {
    await entity(
      await request(harness.app, '/api/worker/claim', {
        method: 'POST',
        token,
        body: { workerId, workerInfo: { hostname: `${workerId}.internal`, sshFiles } },
      }),
      200,
    );
  }

  async function setup() {
    const fixture = await executionFixture(harness);
    // Step 1 of adding a computer: its connection only, saved disabled.
    const newTarget = await entity<ComputeTarget>(
      await request(harness.app, '/api/targets', {
        method: 'POST',
        cookie: fixture.administrator.cookie,
        body: {
          name: 'New GPU host',
          host: 'gpu-new.internal',
          port: 22,
          username: 'mmt',
          sshKeyPath: SSH_KEY_PATH,
          knownHostsPath: '/home/worker/.ssh/known_hosts',
          workDirectory: '',
          pythonExecutable: '',
          gpuIds: [],
          maxConcurrentJobs: 1,
          enabled: false,
          executor: 'ssh',
        },
      }),
    );
    const issued = await issueWorkerToken(fixture.administrator.cookie, fixture.project.id);
    await reportPresence(issued.token, 'setup-host', WORKER_SSH_FILES);
    const setupWorker: TargetCheckWorker = { tokenId: issued.item.id, workerId: 'setup-host' };
    return { ...fixture, newTarget, setupToken: issued.token, setupWorker };
  }

  async function requestCheck(cookie: string, targetId: string, worker?: TargetCheckWorker) {
    return request(harness.app, `/api/targets/${targetId}/checks`, {
      method: 'POST',
      cookie,
      ...(worker ? { body: { worker } } : {}),
    });
  }

  async function claimItem(token: string, body: Record<string, unknown>) {
    return (
      await entity<{ item: WorkerTargetCheck | null }>(
        await request(harness.app, '/api/worker/target-checks/claim', {
          method: 'POST',
          token,
          body,
        }),
        200,
      )
    ).item;
  }

  async function complete(token: string, checkId: string, body: Record<string, unknown>) {
    return request(harness.app, `/api/worker/target-checks/${checkId}/complete`, {
      method: 'POST',
      token,
      body,
    });
  }

  async function requestListing(cookie: string, targetId: string, body: Record<string, unknown>) {
    return request(harness.app, `/api/targets/${targetId}/directory-listings`, {
      method: 'POST',
      cookie,
      body,
    });
  }

  async function errorCode(response: Response): Promise<string> {
    return ((await response.json()) as { code: string }).code;
  }

  it('無効のコンピュータは作業ディレクトリとPythonなしで登録でき、有効にするときに必要になる', async () => {
    const fixture = await setup();
    expect(fixture.newTarget).toMatchObject({ enabled: false, workDirectory: '', pythonExecutable: '' });
    const enable = await request(harness.app, `/api/targets/${fixture.newTarget.id}`, {
      method: 'PATCH',
      cookie: fixture.administrator.cookie,
      body: { enabled: true },
    });
    expect(enable.status).toBe(422);
    expect(await errorCode(enable)).toBe('target_setup_incomplete');
    const configured = await entity<ComputeTarget>(
      await request(harness.app, `/api/targets/${fixture.newTarget.id}`, {
        method: 'PATCH',
        cookie: fixture.administrator.cookie,
        body: { workDirectory: '/large/mmt', pythonExecutable: '/usr/bin/python3', enabled: true },
      }),
      200,
    );
    expect(configured).toMatchObject({ enabled: true, workDirectory: '/large/mmt' });
    // A local target has no address or account of its own.
    const local = await entity<ComputeTarget>(
      await request(harness.app, '/api/targets', {
        method: 'POST',
        cookie: fixture.administrator.cookie,
        body: {
          name: 'Local without host',
          host: '',
          port: 22,
          username: '',
          sshKeyPath: '',
          knownHostsPath: '',
          workDirectory: '',
          pythonExecutable: '',
          gpuIds: [],
          maxConcurrentJobs: 1,
          enabled: false,
          executor: 'local',
        },
      }),
    );
    expect(local).toMatchObject({ executor: 'local', host: '', enabled: false });
    // ssh still needs where to connect.
    const sshWithoutHost = await request(harness.app, '/api/targets', {
      method: 'POST',
      cookie: fixture.administrator.cookie,
      body: {
        name: 'No host',
        host: '',
        port: 22,
        username: 'mmt',
        sshKeyPath: SSH_KEY_PATH,
        knownHostsPath: '/home/worker/.ssh/known_hosts',
        workDirectory: '',
        pythonExecutable: '',
        gpuIds: [],
        maxConcurrentJobs: 1,
        enabled: false,
        executor: 'ssh',
      },
    });
    expect(sshWithoutHost.status).toBe(422);
    expect(await errorCode(sshWithoutHost)).toBe('target_connection_required');
  });

  it('接続確認を頼めるworkerは全体管理者だけが見られ、SSHの候補ファイルはProjectのworker一覧に出ない', async () => {
    const fixture = await setup();
    // A worker from before setup checks reports no SSH files and is not offered.
    await reportPresence(fixture.workerToken, 'old-host');
    for (const cookie of [fixture.editor.cookie, fixture.viewer.cookie]) {
      expect((await request(harness.app, '/api/targets/check-workers', { cookie })).status).toBe(
        403,
      );
    }
    const workers = await entity<{ items: TargetCheckWorkerPresence[] }>(
      await request(harness.app, '/api/targets/check-workers', {
        cookie: fixture.administrator.cookie,
      }),
      200,
    );
    expect(workers.items).toEqual([
      expect.objectContaining({
        tokenId: fixture.setupWorker.tokenId,
        workerId: 'setup-host',
        projectId: fixture.project.id,
        hostname: 'setup-host.internal',
        sshFiles: WORKER_SSH_FILES,
      }),
    ]);
    const projectWorkers = await entity<{ items: WorkerPresence[] }>(
      await request(harness.app, `/api/projects/${fixture.project.id}/workers`, {
        cookie: fixture.viewer.cookie,
      }),
      200,
    );
    expect(projectWorkers.items.map((worker) => worker.workerId).sort()).toEqual([
      'old-host',
      'setup-host',
    ]);
    expect(JSON.stringify(projectWorkers.items)).not.toContain('.ssh');
    // Gone quiet for over two minutes: offline, no longer offered.
    await harness.database.query(
      "UPDATE workers SET last_seen_at=now()-interval '121 seconds' WHERE worker_id='setup-host'",
    );
    const afterSilence = await entity<{ items: TargetCheckWorkerPresence[] }>(
      await request(harness.app, '/api/targets/check-workers', {
        cookie: fixture.administrator.cookie,
      }),
      200,
    );
    expect(afterSilence.items).toEqual([]);
  });

  it('workerを指定した接続確認は、MMT_WORKER_TARGET_IDSに無くてもそのworkerだけがclaimする', async () => {
    const fixture = await setup();
    const check = await entity<TargetCheck>(
      await requestCheck(fixture.administrator.cookie, fixture.newTarget.id, fixture.setupWorker),
    );
    expect(check).toMatchObject({ status: 'queued', assignedWorker: fixture.setupWorker });
    // Another worker in charge of the computer does not take a check chosen for someone else.
    expect(
      await claimItem(fixture.workerToken, {
        workerId: 'host-1',
        targetIds: [fixture.newTarget.id],
        kinds: ['connection', 'directory_listing'],
      }),
    ).toBeNull();
    // Same MMT_WORKER_ID under another token is another worker.
    expect(
      await claimItem(fixture.workerToken, { workerId: 'setup-host', kinds: ['connection'] }),
    ).toBeNull();
    const claimed = (await claimItem(fixture.setupToken, {
      workerId: 'setup-host',
      targetIds: [],
      kinds: ['connection', 'directory_listing'],
    }))!;
    expect(claimed).toMatchObject({
      kind: 'connection',
      directoryPath: null,
      check: { id: check.id, status: 'claimed', assignedWorker: fixture.setupWorker },
      target: { id: fixture.newTarget.id, sshKeyPath: SSH_KEY_PATH },
    });
    const finished = await entity<TargetCheck>(
      await complete(fixture.setupToken, check.id, {
        leaseId: claimed.leaseId,
        status: 'finished',
        result: setupResult,
      }),
      200,
    );
    expect(finished).toMatchObject({ status: 'finished', workerId: 'setup-host', result: setupResult });
    const listed = await entity<{ items: TargetCheck[] }>(
      await request(harness.app, `/api/targets/${fixture.newTarget.id}/checks`, {
        cookie: fixture.administrator.cookie,
      }),
      200,
    );
    expect(listed.items[0]!.result).toEqual(setupResult);
  });

  it('オンラインでない・SSHの候補ファイルを報告しない・失効したtokenのworkerは指定できない', async () => {
    const fixture = await setup();
    await reportPresence(fixture.workerToken, 'old-host');
    const workerTokenId = (
      await harness.database.query<{ token_id: string }>(
        "SELECT token_id FROM workers WHERE worker_id='old-host'",
      )
    ).rows[0]!.token_id;
    const unavailable = [
      { tokenId: workerTokenId, workerId: 'old-host' },
      { tokenId: fixture.setupWorker.tokenId, workerId: 'never-seen' },
    ];
    for (const worker of unavailable) {
      const response = await requestCheck(fixture.administrator.cookie, fixture.newTarget.id, worker);
      expect(response.status).toBe(422);
      expect(await errorCode(response)).toBe('target_check_worker_unavailable');
    }
    await harness.database.query('UPDATE api_tokens SET revoked_at=now() WHERE id=$1', [
      fixture.setupWorker.tokenId,
    ]);
    const revoked = await requestCheck(
      fixture.administrator.cookie,
      fixture.newTarget.id,
      fixture.setupWorker,
    );
    expect(await errorCode(revoked)).toBe('target_check_worker_unavailable');
    expect((await harness.database.query('SELECT 1 FROM target_checks')).rowCount).toBe(0);
  });

  it('接続確認の依頼は全体管理者だけで、成功も拒否も監査ログに残る', async () => {
    const fixture = await setup();
    const denied = await requestCheck(
      fixture.editor.cookie,
      fixture.newTarget.id,
      fixture.setupWorker,
    );
    expect(denied.status).toBe(403);
    const check = await entity<TargetCheck>(
      await requestCheck(fixture.administrator.cookie, fixture.newTarget.id, fixture.setupWorker),
    );
    const events = await harness.database.query<{
      outcome: string;
      actor_user_id: string;
      resource_id: string;
      details: Record<string, unknown>;
    }>(
      "SELECT outcome,actor_user_id,resource_id,details FROM audit_events WHERE action='compute_target.check' ORDER BY occurred_at",
    );
    expect(events.rows).toEqual([
      expect.objectContaining({
        outcome: 'denied',
        actor_user_id: fixture.editor.userId,
        resource_id: fixture.newTarget.id,
        details: expect.objectContaining({ code: 'admin_required' }),
      }),
      expect.objectContaining({
        outcome: 'success',
        actor_user_id: fixture.administrator.userId,
        details: {
          workerTokenId: fixture.setupWorker.tokenId,
          workerId: 'setup-host',
          checkId: check.id,
        },
      }),
    ]);
  });

  it('version 2の結果の候補も鍵のパス・tokenの検査を受け、種類に合わない結果は保存しない', async () => {
    const fixture = await setup();
    await entity(
      await requestCheck(fixture.administrator.cookie, fixture.newTarget.id, fixture.setupWorker),
    );
    const claimed = (await claimItem(fixture.setupToken, {
      workerId: 'setup-host',
      kinds: ['connection', 'directory_listing'],
    }))!;
    const leaked: TargetCheckResult = {
      ...setupResult,
      directories: [
        { path: `${SSH_KEY_PATH}.d`, source: 'home_child', writable: true, freeBytes: null },
      ],
    };
    const leakedToken: TargetCheckResult = {
      ...setupResult,
      pythons: [{ path: '/opt/mmt_abcdefghijklmnop/bin/python', version: null }],
    };
    for (const result of [leaked, leakedToken]) {
      const response = await complete(fixture.setupToken, claimed.check.id, {
        leaseId: claimed.leaseId,
        status: 'finished',
        result,
      });
      expect(await errorCode(response)).toBe('target_check_secret_in_result');
    }
    const wrongKind = await complete(fixture.setupToken, claimed.check.id, {
      leaseId: claimed.leaseId,
      status: 'finished',
      result: listingResult,
    });
    expect(wrongKind.status).toBe(422);
    expect(await errorCode(wrongKind)).toBe('target_check_result_kind');
    const oversized = await complete(fixture.setupToken, claimed.check.id, {
      leaseId: claimed.leaseId,
      status: 'finished',
      result: {
        ...setupResult,
        directories: Array.from({ length: 40 }, (_, index) => ({
          path: `/data/${index}/${'d'.repeat(1000)}`,
          source: 'mount',
          writable: true,
          freeBytes: null,
        })),
      },
    });
    expect(await errorCode(oversized)).toBe('target_check_result_too_large');
    // A version 1 result (older workers) keeps being taken.
    const { host: _host, pythons: _pythons, directories: _directories, ...facts } = setupResult as Extract<
      TargetCheckResult,
      { version: 2 }
    >;
    const versionOne = await entity<TargetCheck>(
      await complete(fixture.setupToken, claimed.check.id, {
        leaseId: claimed.leaseId,
        status: 'finished',
        result: { ...facts, version: 1 },
      }),
      200,
    );
    expect(versionOne.result).toEqual({ ...facts, version: 1 });
  });

  it('ディレクトリの読み取りは指定したworkerだけが受け、以前のworkerはclaimしない', async () => {
    const fixture = await setup();
    const path = '~/projects/';
    const listing = await entity<TargetDirectoryListing>(
      await requestListing(fixture.administrator.cookie, fixture.newTarget.id, {
        path,
        worker: fixture.setupWorker,
      }),
    );
    expect(listing).toMatchObject({
      path,
      status: 'queued',
      assignedWorker: fixture.setupWorker,
      result: null,
    });
    // The same path waited for again returns the same listing.
    const again = await entity<TargetDirectoryListing>(
      await requestListing(fixture.administrator.cookie, fixture.newTarget.id, {
        path,
        worker: fixture.setupWorker,
      }),
      200,
    );
    expect(again.id).toBe(listing.id);
    // The listing is not part of the connection check history.
    const checks = await entity<{ items: TargetCheck[] }>(
      await request(harness.app, `/api/targets/${fixture.newTarget.id}/checks`, {
        cookie: fixture.administrator.cookie,
      }),
      200,
    );
    expect(checks.items).toEqual([]);
    // A worker from before listings asks for connection checks only.
    expect(await claimItem(fixture.setupToken, { workerId: 'setup-host' })).toBeNull();
    const claimed = (await claimItem(fixture.setupToken, {
      workerId: 'setup-host',
      kinds: ['connection', 'directory_listing'],
    }))!;
    expect(claimed).toMatchObject({
      kind: 'directory_listing',
      directoryPath: path,
      check: { id: listing.id, status: 'claimed' },
    });
    const finished = await entity<TargetDirectoryListing>(
      await complete(fixture.setupToken, listing.id, {
        leaseId: claimed.leaseId,
        status: 'finished',
        result: listingResult,
      }),
      200,
    );
    expect(finished).toMatchObject({ id: listing.id, status: 'finished', result: listingResult });
    const read = await entity<TargetDirectoryListing>(
      await request(
        harness.app,
        `/api/targets/${fixture.newTarget.id}/directory-listings/${listing.id}`,
        { cookie: fixture.administrator.cookie },
      ),
      200,
    );
    expect(read).toEqual(finished);
    expect(
      (
        await request(
          harness.app,
          `/api/targets/${fixture.newTarget.id}/directory-listings/${listing.id}`,
          { cookie: fixture.editor.cookie },
        )
      ).status,
    ).toBe(403);
  });

  it('ディレクトリの読み取りはパスを検証し、待っている数に上限があり、監査ログに残る', async () => {
    const fixture = await setup();
    for (const path of ['projects/', '/home/\nmmt', `/${'p'.repeat(1024)}`]) {
      const response = await requestListing(fixture.administrator.cookie, fixture.newTarget.id, {
        path,
        worker: fixture.setupWorker,
      });
      expect(response.status).toBe(422);
    }
    const withoutWorker = await requestListing(fixture.administrator.cookie, fixture.newTarget.id, {
      path: '/data',
    });
    expect(withoutWorker.status).toBe(422);
    expect(
      (
        await requestListing(fixture.editor.cookie, fixture.newTarget.id, {
          path: '/data',
          worker: fixture.setupWorker,
        })
      ).status,
    ).toBe(403);
    for (let index = 0; index < 8; index++)
      await entity(
        await requestListing(fixture.administrator.cookie, fixture.newTarget.id, {
          path: `/data/${index}`,
          worker: fixture.setupWorker,
        }),
      );
    const tooMany = await requestListing(fixture.administrator.cookie, fixture.newTarget.id, {
      path: '/data/8',
      worker: fixture.setupWorker,
    });
    expect(tooMany.status).toBe(409);
    expect(await errorCode(tooMany)).toBe('directory_listing_limit');
    const audited = await harness.database.query<{ outcome: string; count: number }>(
      `SELECT outcome,count(*)::int AS count FROM audit_events
      WHERE action='compute_target.directory_listing' GROUP BY outcome ORDER BY outcome`,
    );
    expect(audited.rows).toEqual([
      { outcome: 'denied', count: 2 },
      { outcome: 'success', count: 8 },
    ]);
    // A site has no worker connection to read through.
    const site = await harness.database.query<{ id: string }>(
      `INSERT INTO compute_targets(name,host,port,username,ssh_key_path,known_hosts_path,work_directory,
        python_executable,gpu_ids,max_concurrent_jobs,enabled,executor,runtime_kinds,dataset_transfer)
      VALUES('Site','',22,'','','','','','{}',1,true,'site','{apptainer}','direct') RETURNING id`,
    );
    const siteListing = await requestListing(fixture.administrator.cookie, site.rows[0]!.id, {
      path: '/data',
      worker: fixture.setupWorker,
    });
    expect(await errorCode(siteListing)).toBe('site_check_unsupported');
  });

  it('読み取りは1分でclaimされなければ失敗になり、終わった読み取りは1日で消える', async () => {
    const fixture = await setup();
    const listing = await entity<TargetDirectoryListing>(
      await requestListing(fixture.administrator.cookie, fixture.newTarget.id, {
        path: '/scratch/',
        worker: fixture.setupWorker,
      }),
    );
    await harness.database.query(
      "UPDATE target_checks SET created_at=now()-interval '61 seconds' WHERE id=$1",
      [listing.id],
    );
    const expired = await entity<TargetDirectoryListing>(
      await request(
        harness.app,
        `/api/targets/${fixture.newTarget.id}/directory-listings/${listing.id}`,
        { cookie: fixture.administrator.cookie },
      ),
      200,
    );
    expect(expired).toMatchObject({ status: 'failed', failureReason: 'no_worker', result: null });
    // A connection check waits five minutes, not one.
    const check = await entity<TargetCheck>(
      await requestCheck(fixture.administrator.cookie, fixture.newTarget.id, fixture.setupWorker),
    );
    await harness.database.query(
      "UPDATE target_checks SET created_at=now()-interval '61 seconds' WHERE id=$1",
      [check.id],
    );
    await harness.database.query(
      "UPDATE target_checks SET finished_at=now()-interval '25 hours' WHERE id=$1",
      [listing.id],
    );
    const [stillQueued] = (
      await entity<{ items: TargetCheck[] }>(
        await request(harness.app, `/api/targets/${fixture.newTarget.id}/checks`, {
          cookie: fixture.administrator.cookie,
        }),
        200,
      )
    ).items;
    expect(stillQueued).toMatchObject({ id: check.id, status: 'queued' });
    expect(
      (await harness.database.query('SELECT 1 FROM target_checks WHERE id=$1', [listing.id]))
        .rowCount,
    ).toBe(0);
  });

  it('実行中の依頼をactiveCheckIdsで伝えたworkerは2件目をclaimでき、伝えなければ同じleaseを受け直す', async () => {
    const fixture = await setup();
    const check = await entity<TargetCheck>(
      await requestCheck(fixture.administrator.cookie, fixture.newTarget.id, fixture.setupWorker),
    );
    const listing = await entity<TargetDirectoryListing>(
      await requestListing(fixture.administrator.cookie, fixture.newTarget.id, {
        path: '/large/',
        worker: fixture.setupWorker,
      }),
    );
    const body = { workerId: 'setup-host', kinds: ['connection', 'directory_listing'] };
    const first = (await claimItem(fixture.setupToken, body))!;
    expect(first.check.id).toBe(check.id);
    const resent = (await claimItem(fixture.setupToken, body))!;
    expect(resent).toMatchObject({ leaseId: first.leaseId, check: { id: check.id } });
    const second = (await claimItem(fixture.setupToken, {
      ...body,
      activeCheckIds: [check.id],
    }))!;
    expect(second).toMatchObject({ kind: 'directory_listing', check: { id: listing.id } });
    expect(
      await claimItem(fixture.setupToken, { ...body, activeCheckIds: [check.id, listing.id] }),
    ).toBeNull();
  });
});
