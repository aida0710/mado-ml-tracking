import { workerInfo } from './workerFixtures.js';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type {
  NotificationChannel,
  NotificationEvent,
  NotificationEventType,
  OperationsAlert,
  PluginConnection,
  PluginOutboxSummary,
} from '@mmt/contracts';
import { createApplication } from '../src/app.js';
import { jobCreateSchema } from '../src/domain/validation.js';
import { PLUGIN_STALL_ATTEMPTS } from '../src/domain/operationsAlerts.js';
import { OperationsMonitor } from '../src/services/operationsMonitor.js';
import { createHarness, entity, login, request, testDatabaseUrl, type Harness } from './harness.js';
import { executionFixture } from './fixtures.js';
import { MADO_CREDENTIALS_FIXTURE, madoClientStub, madoPluginInput } from './pluginFixtures.js';

const environment = {
  MMT_NOTIFICATION_OPS_URL: 'https://hooks.slack.example/services/T/B/OPS',
};

const OPERATIONS_EVENT_TYPES: NotificationEventType[] = [
  'job.heartbeat_stale',
  'job.heartbeat_recovered',
  'worker.offline',
  'plugin.delivery_stalled',
];

describe.skipIf(!testDatabaseUrl)('運用監視ループと運用アラート（独立PostgreSQL）', () => {
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

  /** `plugin.isUnavailable`がtrueの間、pluginのクライアントが失敗するアプリ。 */
  function applicationWithPlugin() {
    const plugin = { isUnavailable: true, delivered: [] as string[] };
    const client = madoClientStub({
      sendPayload: async (payload) => {
        if (plugin.isUnavailable) throw new Error('Unavailable');
        plugin.delivered.push(payload);
      },
    });
    const application = createApplication({
      config: harness.config,
      database: harness.database,
      stores: harness.stores,
      environment,
      pluginClientFactory: () => client,
    });
    return { application, plugin };
  }

  async function setup() {
    const fixture = await executionFixture(harness);
    const projectAdmin = await login(harness, 'project-admin@localhost');
    await entity(
      await request(harness.app, `${fixture.basePath}/members/${projectAdmin.userId}`, {
        method: 'PUT',
        cookie: fixture.administrator.cookie,
        body: { role: 'admin' },
      }),
      200,
    );
    const channel = await entity<NotificationChannel>(
      await request(harness.app, '/api/notification-channels', {
        method: 'POST',
        cookie: fixture.administrator.cookie,
        body: { kind: 'slack_webhook', name: 'ops', urlEnv: 'MMT_NOTIFICATION_OPS_URL' },
      }),
    );
    await entity(
      await request(harness.app, `${fixture.basePath}/notification-rules`, {
        method: 'POST',
        cookie: projectAdmin.cookie,
        body: { channelId: channel.id, eventTypes: OPERATIONS_EVENT_TYPES },
      }),
    );
    const workerPrincipal = (await harness.services.auth.authenticate({
      bearer: fixture.workerToken,
    }))!;
    const editorSession = fixture.editor.cookie.slice(fixture.editor.cookie.indexOf('=') + 1);
    const editorPrincipal = (await harness.services.auth.authenticate({
      session: editorSession,
    }))!;
    return { ...fixture, projectAdmin, workerPrincipal, editorPrincipal };
  }
  type Setup = Awaited<ReturnType<typeof setup>>;

  function monitor(): OperationsMonitor {
    return new OperationsMonitor(harness.database, { webOrigin: harness.config.webOrigin });
  }

  async function claimedJob(fixture: Setup) {
    const run = await fixture.newRun('Train', 'training');
    const job = await harness.services.jobs.create(
      fixture.editorPrincipal,
      fixture.project.id,
      jobCreateSchema.parse({ runId: run.id, targetId: fixture.target.id, gpuIds: ['0'] }),
    );
    const claimed = await harness.services.worker.claim(fixture.workerPrincipal, {
      workerInfo,
      workerId: 'gpu-host-1',
    });
    const leaseId = claimed!.job.leaseId!;
    return { run, job, leaseId };
  }

  async function queuedNotifications(): Promise<
    { event_type: string; dedupe_key: string; event: NotificationEvent }[]
  > {
    return (
      await harness.database.query(
        'SELECT event_type,dedupe_key,event FROM notification_outbox ORDER BY created_at,event_type',
      )
    ).rows;
  }

  async function listAlerts(fixture: Setup, query = '') {
    return (
      await entity<{ items: OperationsAlert[] }>(
        await request(harness.app, `${fixture.basePath}/operations-alerts${query}`, {
          cookie: fixture.viewer.cookie,
        }),
        200,
      )
    ).items;
  }

  // workerは応答させたままにし、Jobのheartbeatだけが古くなるようにする。
  async function ageJobHeartbeat(jobId: string): Promise<void> {
    await harness.database.query(
      "UPDATE jobs SET heartbeat_at=now()-interval '61 seconds' WHERE id=$1",
      [jobId],
    );
  }

  it('heartbeatが途絶えたJobは通知が1回だけ積まれ、次のtickでは増えない', async () => {
    const fixture = await setup();
    const { run, job } = await claimedJob(fixture);
    expect(await monitor().tick()).toEqual({ acquired: true, opened: 0, resolved: 0 });

    await ageJobHeartbeat(job.id);
    expect(await monitor().tick()).toMatchObject({ opened: 1, resolved: 0 });
    expect(await monitor().tick()).toMatchObject({ opened: 0, resolved: 0 });

    const queued = await queuedNotifications();
    expect(queued).toHaveLength(1);
    expect(queued[0]!.event_type).toBe('job.heartbeat_stale');
    expect(queued[0]!.event).toMatchObject({
      type: 'job.heartbeat_stale',
      title: 'Jobのheartbeatが途絶えました: Train',
      details: { jobId: job.id, runId: run.id, workerId: 'gpu-host-1' },
      url: `${harness.config.webOrigin}/projects/${fixture.project.id}/runs/${run.id}`,
    });
    const alerts = await listAlerts(fixture);
    expect(alerts).toEqual([
      expect.objectContaining({
        kind: 'job.heartbeat_stale',
        subjectId: job.id,
        projectId: fixture.project.id,
        resolvedAt: null,
        resolution: null,
      }),
    ]);
  });

  it('全Projectのアラート一覧には、メンバーのProjectのものだけが入り、全体管理者のsessionには全Projectのものが入る', async () => {
    const fixture = await setup();
    const { job } = await claimedJob(fixture);
    await ageJobHeartbeat(job.id);
    expect(await monitor().tick()).toMatchObject({ opened: 1 });
    const visibleAlerts = async (credentials: { cookie?: string; token?: string }) =>
      (
        await entity<{ items: OperationsAlert[] }>(
          await request(harness.app, '/api/operations-alerts', credentials),
          200,
        )
      ).items;
    const opened = expect.objectContaining({
      kind: 'job.heartbeat_stale',
      subjectId: job.id,
      projectId: fixture.project.id,
    });
    for (const identity of [fixture.viewer, fixture.administrator])
      expect(await visibleAlerts({ cookie: identity.cookie })).toEqual([opened]);
    // Projectは非公開で、outsiderはそこでroleを持たない。
    expect(await visibleAlerts({ cookie: fixture.outsider.cookie })).toEqual([]);

    // 別のProjectに限定したtokenには、そのProjectのものしか見えない。
    const otherProject = await entity<{ id: string }>(
      await request(harness.app, '/api/projects', {
        method: 'POST',
        cookie: fixture.viewer.cookie,
        body: { name: 'Elsewhere', visibility: 'private' },
      }),
    );
    const limited = await entity<{ token: string }>(
      await request(harness.app, '/api/tokens', {
        method: 'POST',
        cookie: fixture.viewer.cookie,
        body: { name: 'Elsewhere', projectId: otherProject.id, scopes: ['read'] },
      }),
    );
    expect(await visibleAlerts({ token: limited.token })).toEqual([]);

    // 公開によるアクセスはmembershipではない。公開Projectは誰でも開けるが、そのアラートは
    // メンバーのベルしか鳴らさない。
    await harness.database.query("UPDATE projects SET visibility='public' WHERE id=$1", [
      fixture.project.id,
    ]);
    expect(await visibleAlerts({ cookie: fixture.outsider.cookie })).toEqual([]);
    expect(await visibleAlerts({ cookie: fixture.viewer.cookie })).toEqual([opened]);

    // 全体管理者のtokenはその人として動くので、ほかの人と同じくmembershipが要る。
    const administratorToken = await entity<{ token: string }>(
      await request(harness.app, '/api/tokens', {
        method: 'POST',
        cookie: fixture.administrator.cookie,
        body: { name: 'Bell', scopes: ['read'] },
      }),
    );
    expect(await visibleAlerts({ token: administratorToken.token })).toEqual([opened]);
    await harness.database.query('DELETE FROM project_members WHERE project_id=$1 AND user_id=$2', [
      fixture.project.id,
      fixture.administrator.userId,
    ]);
    expect(await visibleAlerts({ token: administratorToken.token })).toEqual([]);
    expect(await visibleAlerts({ cookie: fixture.administrator.cookie })).toEqual([opened]);

    // アーカイブしたProjectのアラートは、全体管理者にももう出さない。
    await harness.database.query('UPDATE projects SET archived_at=now(),archived_by=$2 WHERE id=$1', [
      fixture.project.id,
      fixture.administrator.userId,
    ]);
    expect(await visibleAlerts({ cookie: fixture.administrator.cookie })).toEqual([]);
  });

  it('heartbeatが戻るとアラートはrecoveredで閉じ、recovered通知が1件積まれる', async () => {
    const fixture = await setup();
    const { job, leaseId } = await claimedJob(fixture);
    await ageJobHeartbeat(job.id);
    await monitor().tick();

    await harness.services.worker.heartbeat(fixture.workerPrincipal, job.id, { leaseId });
    expect(await monitor().tick()).toMatchObject({ opened: 0, resolved: 1 });
    expect(await monitor().tick()).toMatchObject({ opened: 0, resolved: 0 });

    expect((await queuedNotifications()).map((row) => row.event_type)).toEqual([
      'job.heartbeat_stale',
      'job.heartbeat_recovered',
    ]);
    expect(await listAlerts(fixture)).toEqual([]);
    expect(await listAlerts(fixture, '?state=all')).toEqual([
      expect.objectContaining({ kind: 'job.heartbeat_stale', resolution: 'recovered' }),
    ]);

    // 2回目の停止は新しい発生として扱い、もう一度通知する。
    await ageJobHeartbeat(job.id);
    expect(await monitor().tick()).toMatchObject({ opened: 1 });
    expect(await queuedNotifications()).toHaveLength(3);
  });

  it('途絶中にJobが終わるとinactiveで閉じ、recovered通知は積まない', async () => {
    const fixture = await setup();
    const { job, leaseId } = await claimedJob(fixture);
    await ageJobHeartbeat(job.id);
    await monitor().tick();

    await harness.services.worker.complete(fixture.workerPrincipal, job.id, {
      leaseId,
      status: 'failed',
      exitCode: 1,
    });
    expect(await monitor().tick()).toMatchObject({ resolved: 1 });
    expect(await listAlerts(fixture, '?state=all')).toEqual([
      expect.objectContaining({ kind: 'job.heartbeat_stale', resolution: 'inactive' }),
    ]);
    expect((await queuedNotifications()).map((row) => row.event_type)).toEqual([
      'job.heartbeat_stale',
    ]);
  });

  it('応答の途絶えたworkerはworker.offlineを1件通知し、claimで戻ると閉じる', async () => {
    const fixture = await setup();
    await harness.services.worker.claim(fixture.workerPrincipal, {
      workerId: 'gpu-host-2',
      workerInfo: { ...workerInfo, hostname: 'gpu-2.internal' },
    });
    await harness.database.query(
      "UPDATE workers SET last_seen_at=now()-interval '121 seconds' WHERE worker_id='gpu-host-2'",
    );
    expect(await monitor().tick()).toMatchObject({ opened: 1 });
    expect(await monitor().tick()).toMatchObject({ opened: 0 });

    const queued = await queuedNotifications();
    expect(queued).toHaveLength(1);
    expect(queued[0]!.event).toMatchObject({
      type: 'worker.offline',
      title: 'workerが応答しません: gpu-host-2 (gpu-2.internal)',
      details: { workerId: 'gpu-host-2', hostname: 'gpu-2.internal', tokenName: 'Test Worker' },
      url: `${harness.config.webOrigin}/projects/${fixture.project.id}/compute`,
    });
    expect(JSON.stringify(queued[0]!.event)).not.toContain(fixture.workerToken);

    await harness.services.worker.claim(fixture.workerPrincipal, { workerInfo, workerId: 'gpu-host-2' });
    expect(await monitor().tick()).toMatchObject({ resolved: 1 });
    expect(await listAlerts(fixture, '?state=all')).toEqual([
      expect.objectContaining({ kind: 'worker.offline', resolution: 'recovered' }),
    ]);
  });

  it('1週間以上応答の無いworkerは引退扱いで、新しいアラートを開かず開いていたものはinactiveで閉じる', async () => {
    const fixture = await setup();
    await harness.services.worker.claim(fixture.workerPrincipal, { workerInfo, workerId: 'old-host' });
    await harness.database.query(
      "UPDATE workers SET last_seen_at=now()-interval '3 minutes' WHERE worker_id='old-host'",
    );
    await monitor().tick();
    await harness.database.query(
      "UPDATE workers SET last_seen_at=now()-interval '8 days' WHERE worker_id='old-host'",
    );
    expect(await monitor().tick()).toMatchObject({ opened: 0, resolved: 1 });
    expect(await listAlerts(fixture, '?state=all')).toEqual([
      expect.objectContaining({ kind: 'worker.offline', resolution: 'inactive' }),
    ]);
  });

  it('plugin送信が5回失敗するとstalled通知が1件出て、送信できるとアラートが閉じる', async () => {
    const fixture = await setup();
    const { application, plugin } = applicationWithPlugin();
    const connection = await entity<PluginConnection>(
      await request(application.app, `${fixture.basePath}/plugins`, {
        method: 'POST',
        cookie: fixture.administrator.cookie,
        body: madoPluginInput(),
      }),
    );
    const run = await fixture.newRun();
    await entity(
      await request(application.app, `${fixture.basePath}/runs/${run.id}`, {
        method: 'PATCH',
        cookie: fixture.editor.cookie,
        body: { status: 'running' },
      }),
      200,
    );
    const makeDue = () =>
      harness.database.query("UPDATE plugin_outbox SET next_attempt_at=now() WHERE status='pending'");

    for (let attempt = 1; attempt < PLUGIN_STALL_ATTEMPTS; attempt++) {
      await makeDue();
      await application.outbox.dispatchBatch();
    }
    expect(await monitor().tick()).toMatchObject({ opened: 0 });
    await makeDue();
    await application.outbox.dispatchBatch();
    expect(await monitor().tick()).toMatchObject({ opened: 1 });
    expect(await monitor().tick()).toMatchObject({ opened: 0 });

    const summaryPath = `${fixture.basePath}/plugins/${connection.id}/outbox`;
    const stalled = await entity<PluginOutboxSummary>(
      await request(application.app, summaryPath, { cookie: fixture.projectAdmin.cookie }),
      200,
    );
    expect(stalled).toMatchObject({
      pending: 1,
      sending: 0,
      maxAttempts: PLUGIN_STALL_ATTEMPTS,
      lastError: 'plugin_delivery_failed',
      lastDeliveredAt: null,
      stalled: true,
    });
    expect(stalled.oldestPendingAt).toEqual(expect.any(String));

    const queued = await queuedNotifications();
    expect(queued).toHaveLength(1);
    expect(queued[0]!.event).toMatchObject({
      type: 'plugin.delivery_stalled',
      details: { pluginId: connection.id, pluginName: 'Mado', undelivered: 1, maxAttempts: 5 },
    });
    expect(JSON.stringify(queued[0]!.event)).not.toContain(MADO_CREDENTIALS_FIXTURE.accessToken!);

    plugin.isUnavailable = false;
    await makeDue();
    expect(await application.outbox.dispatchBatch()).toBe(1);
    expect(await monitor().tick()).toMatchObject({ resolved: 1 });
    expect(await listAlerts(fixture, '?state=all')).toEqual([
      expect.objectContaining({ kind: 'plugin.delivery_stalled', resolution: 'recovered' }),
    ]);
    const recovered = await entity<PluginOutboxSummary>(
      await request(application.app, summaryPath, { cookie: fixture.projectAdmin.cookie }),
      200,
    );
    expect(recovered).toMatchObject({
      pending: 0,
      oldestPendingAt: null,
      maxAttempts: 0,
      lastError: null,
      stalled: false,
    });
    expect(recovered.lastDeliveredAt).toEqual(expect.any(String));
  });

  it('15分以上未送信のeventはplugin滞留になり、pluginを無効にするとinactiveで閉じる', async () => {
    const fixture = await setup();
    const { application } = applicationWithPlugin();
    const connection = await entity<PluginConnection>(
      await request(application.app, `${fixture.basePath}/plugins`, {
        method: 'POST',
        cookie: fixture.administrator.cookie,
        body: madoPluginInput(),
      }),
    );
    const run = await fixture.newRun();
    await entity(
      await request(application.app, `${fixture.basePath}/runs/${run.id}`, {
        method: 'PATCH',
        cookie: fixture.editor.cookie,
        body: { status: 'running' },
      }),
      200,
    );
    expect(await monitor().tick()).toMatchObject({ opened: 0 });
    await harness.database.query(
      "UPDATE plugin_outbox SET created_at=now()-interval '901 seconds' WHERE plugin_id=$1",
      [connection.id],
    );
    expect(await monitor().tick()).toMatchObject({ opened: 1 });

    await entity(
      await request(application.app, `${fixture.basePath}/plugins/${connection.id}`, {
        method: 'PATCH',
        cookie: fixture.administrator.cookie,
        body: { enabled: false },
      }),
      200,
    );
    expect(await monitor().tick()).toMatchObject({ resolved: 1 });
    expect(await listAlerts(fixture, '?state=all')).toEqual([
      expect.objectContaining({ kind: 'plugin.delivery_stalled', resolution: 'inactive' }),
    ]);
    // 無効にしたpluginも未送信の件数は報告するが、滞っているとは数えない。
    expect(
      await entity<PluginOutboxSummary>(
        await request(application.app, `${fixture.basePath}/plugins/${connection.id}/outbox`, {
          cookie: fixture.administrator.cookie,
        }),
        200,
      ),
    ).toMatchObject({ pending: 1, stalled: false });
  });

  it('2つのmonitorを同時に動かしてもアラートと通知は重複しない', async () => {
    const fixture = await setup();
    const { job } = await claimedJob(fixture);
    await ageJobHeartbeat(job.id);

    const ticks = await Promise.all([monitor().tick(), monitor().tick(), monitor().tick()]);
    expect(ticks.reduce((sum, tick) => sum + tick.opened, 0)).toBe(1);
    expect(await queuedNotifications()).toHaveLength(1);
    const open = await harness.database.query(
      'SELECT count(*)::int AS count FROM operations_alerts WHERE resolved_at IS NULL',
    );
    expect(open.rows[0].count).toBe(1);
  });

  it('outbox summaryはProject admin以外に403、別Projectのpluginは404。アラート一覧はviewerが読めて部外者は読めない', async () => {
    const fixture = await setup();
    const { application } = applicationWithPlugin();
    const connection = await entity<PluginConnection>(
      await request(application.app, `${fixture.basePath}/plugins`, {
        method: 'POST',
        cookie: fixture.administrator.cookie,
        body: madoPluginInput(),
      }),
    );
    // 公開する応答には認証情報が保存されているかどうかだけを出し、値は出さない。
    expect(connection.tokenConfigured).toBe(true);
    expect(JSON.stringify(connection)).not.toContain(MADO_CREDENTIALS_FIXTURE.accessToken!);
    const unconfigured = await entity<PluginConnection>(
      await request(application.app, `${fixture.basePath}/plugins`, {
        method: 'POST',
        cookie: fixture.administrator.cookie,
        body: madoPluginInput({ name: 'Unconfigured', enabled: false, credentials: {} }),
      }),
    );
    expect(unconfigured.tokenConfigured).toBe(false);
    const check = await request(
      application.app,
      `${fixture.basePath}/plugins/${unconfigured.id}/check`,
      { method: 'POST', cookie: fixture.administrator.cookie },
    );
    expect(check.status).toBe(503);
    expect(await check.text()).not.toContain(MADO_CREDENTIALS_FIXTURE.accessToken!);
    const summaryPath = `${fixture.basePath}/plugins/${connection.id}/outbox`;
    for (const identity of [fixture.editor, fixture.viewer])
      expect((await request(application.app, summaryPath, { cookie: identity.cookie })).status).toBe(
        403,
      );
    expect(
      (await request(application.app, summaryPath, { cookie: fixture.projectAdmin.cookie })).status,
    ).toBe(200);

    const otherProject = await entity<{ id: string }>(
      await request(application.app, '/api/projects', {
        method: 'POST',
        cookie: fixture.administrator.cookie,
        body: { name: 'Other Project' },
      }),
    );
    const crossProject = await request(
      application.app,
      `/api/projects/${otherProject.id}/plugins/${connection.id}/outbox`,
      { cookie: fixture.administrator.cookie },
    );
    expect(crossProject.status).toBe(404);

    expect(await listAlerts(fixture)).toEqual([]);
    const outsider = await request(harness.app, `${fixture.basePath}/operations-alerts`, {
      cookie: fixture.outsider.cookie,
    });
    expect([403, 404]).toContain(outsider.status);
    const invalid = await request(harness.app, `${fixture.basePath}/operations-alerts?state=x`, {
      cookie: fixture.viewer.cookie,
    });
    expect(invalid.status).toBe(422);
  });
});
