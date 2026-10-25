import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type {
  Dataset,
  DatasetVersion,
  Project,
  ServiceAccount,
  WorkflowExecution,
} from '@mmt/contracts';
import { referenceDigest } from './fixtures.js';
import { createHarness, entity, login, request, testDatabaseUrl, type Harness } from './harness.js';
import { workflowFixture, type WorkflowFixture } from './workflowFixtures.js';

/** How a request authenticates: a person's session or an API token. */
type Caller = { cookie: string } | { token: string };

describe.skipIf(!testDatabaseUrl)('ワークフローの権限（独立PostgreSQL）', () => {
  let harness: Harness;
  let fixture: WorkflowFixture;
  beforeAll(async () => {
    harness = await createHarness();
  });
  beforeEach(async () => {
    await harness.reset();
    fixture = await workflowFixture(harness);
  });
  afterAll(async () => {
    await harness?.close();
  });

  async function colleagueEditor(): Promise<{ cookie: string; userId: string }> {
    const colleague = await login(harness, 'colleague@localhost');
    await entity(
      await request(harness.app, `${fixture.basePath}/members/${colleague.userId}`, {
        method: 'PUT',
        cookie: fixture.administrator.cookie,
        body: { role: 'editor' },
      }),
      200,
    );
    return colleague;
  }

  function cancel(executionId: string, caller: Caller, basePath = fixture.basePath) {
    return request(harness.app, `${basePath}/workflow-executions/${executionId}/cancel`, {
      method: 'POST',
      ...caller,
    });
  }

  function launch(
    workflowId: string,
    caller: Caller,
    body: { idempotencyKey: string; resumeFromExecutionId?: string },
    basePath = fixture.basePath,
  ) {
    return request(harness.app, `${basePath}/workflows/${workflowId}/launch`, {
      method: 'POST',
      ...caller,
      body: { revision: 1, ...body },
    });
  }

  async function errorCode(response: Response, status: number): Promise<string> {
    expect(response.status).toBe(status);
    return ((await response.json()) as { code: string }).code;
  }

  /** An execution whose training step failed, so it can be resumed. */
  async function failedExecution(workflowId: string): Promise<WorkflowExecution> {
    const execution = await entity<WorkflowExecution>(
      await launch(workflowId, fixture.editor, { idempotencyKey: 'failing' }),
    );
    const processing = await fixture.claim();
    await fixture.output(processing.run.id);
    await fixture.finish(processing);
    await fixture.finish(await fixture.claim(), 'failed');
    expect((await fixture.execution(execution.id)).status).toBe('failed');
    return execution;
  }

  it('作成者でないeditorは実行を停止も再開もできず、作成者とProject adminはできる', async () => {
    const definition = await fixture.createWorkflow();
    const workflowId = definition.workflow.id;
    const colleague = await colleagueEditor();

    const running = await fixture.launch(definition);
    expect(await errorCode(await cancel(running.id, colleague), 403)).toBe(
      'workflow_control_forbidden',
    );
    expect(await errorCode(await cancel(running.id, fixture.viewer), 403)).toBe(
      'project_forbidden',
    );
    const canceledByAdmin = await entity<WorkflowExecution>(
      await cancel(running.id, fixture.administrator),
      200,
    );
    expect(canceledByAdmin.status).toBe('canceled');

    const failed = await failedExecution(workflowId);
    expect(
      await errorCode(
        await launch(workflowId, colleague, {
          idempotencyKey: 'colleague-resume',
          resumeFromExecutionId: failed.id,
        }),
        403,
      ),
    ).toBe('workflow_control_forbidden');
    const resumedByAdmin = await entity<WorkflowExecution>(
      await launch(workflowId, fixture.administrator, {
        idempotencyKey: 'admin-resume',
        resumeFromExecutionId: failed.id,
      }),
    );
    expect(resumedByAdmin.createdBy).toBe(fixture.administrator.userId);
    expect(resumedByAdmin.steps[0]!.reused).toBe(true);
    const resumedByCreator = await entity<WorkflowExecution>(
      await launch(workflowId, fixture.editor, {
        idempotencyKey: 'creator-resume',
        resumeFromExecutionId: failed.id,
      }),
    );
    expect(resumedByCreator.steps[0]!.reused).toBe(true);
    // The colleague still starts executions of their own and stops them.
    const own = await entity<WorkflowExecution>(
      await launch(workflowId, colleague, { idempotencyKey: 'colleague-own' }),
    );
    expect((await entity<WorkflowExecution>(await cancel(own.id, colleague), 200)).status).toBe(
      'canceled',
    );
  });

  it('アーカイブしたProjectのワークフローは操作できず、ステップの間にあった実行は次を起動せずに終わる', async () => {
    const definition = await fixture.createWorkflow();
    const execution = await fixture.launch(definition);
    // A Project with a queued or running Job cannot be archived; between steps there is none.
    const processing = await fixture.claim();
    await fixture.output(processing.run.id);
    await fixture.complete(processing);
    expect(
      (
        await request(harness.app, `/api/projects/${fixture.project.id}/archive`, {
          method: 'POST',
          cookie: fixture.administrator.cookie,
        })
      ).status,
    ).toBe(204);
    const refusals = [
      await request(harness.app, `${fixture.basePath}/workflows/${definition.workflow.id}`, {
        cookie: fixture.editor.cookie,
      }),
      await request(harness.app, `${fixture.basePath}/workflows`, {
        method: 'POST',
        cookie: fixture.editor.cookie,
        body: { name: 'after archive', steps: fixture.steps },
      }),
      await launch(definition.workflow.id, fixture.editor, { idempotencyKey: 'after-archive' }),
      await cancel(execution.id, fixture.editor),
    ];
    for (const refusal of refusals) expect(await errorCode(refusal, 404)).toBe('project_archived');

    await harness.workflowScheduler.tick();
    const stopped = await harness.database.query<{ status: string; error: string }>(
      'SELECT status,error FROM workflow_executions WHERE id=$1',
      [execution.id],
    );
    expect(stopped.rows[0]).toMatchObject({
      status: 'failed',
      error: expect.stringContaining('archived'),
    });
    expect(
      (await harness.database.query('SELECT count(*)::int AS count FROM jobs')).rows[0].count,
    ).toBe(1);
  });

  it('別Projectのワークフロー・実行・入力のIDを混ぜた要求は見つからない扱いになる', async () => {
    const definition = await fixture.createWorkflow();
    const execution = await fixture.launch(definition);
    const other = await entity<Project>(
      await request(harness.app, '/api/projects', {
        method: 'POST',
        cookie: fixture.administrator.cookie,
        body: { name: 'Other Project', visibility: 'private' },
      }),
    );
    await entity(
      await request(harness.app, `/api/projects/${other.id}/members/${fixture.editor.userId}`, {
        method: 'PUT',
        cookie: fixture.administrator.cookie,
        body: { role: 'editor' },
      }),
      200,
    );
    const otherPath = `/api/projects/${other.id}`;
    const otherDataset = await entity<Dataset>(
      await request(harness.app, `${otherPath}/datasets`, {
        method: 'POST',
        cookie: fixture.editor.cookie,
        body: { name: 'Other speech' },
      }),
    );
    const otherVersion = await entity<DatasetVersion>(
      await request(harness.app, `${otherPath}/datasets/${otherDataset.id}/versions`, {
        method: 'POST',
        cookie: fixture.editor.cookie,
        body: {
          version: 'v1',
          uri: 'https://datasets.example.test/other.json',
          digest: referenceDigest('other'),
        },
      }),
    );

    // This Project's workflow and execution under the other Project's path.
    for (const response of [
      await request(harness.app, `${otherPath}/workflows/${definition.workflow.id}`, {
        cookie: fixture.editor.cookie,
      }),
      await launch(definition.workflow.id, fixture.editor, { idempotencyKey: 'mixed' }, otherPath),
      await cancel(execution.id, fixture.editor, otherPath),
      await request(harness.app, `${otherPath}/workflow-executions/${execution.id}`, {
        cookie: fixture.editor.cookie,
      }),
    ])
      expect(response.status).toBe(404);
    // The other Project's dataset version as a pinned input of this Project's workflow.
    const mixedInput = await request(harness.app, `${fixture.basePath}/workflows`, {
      method: 'POST',
      cookie: fixture.editor.cookie,
      body: {
        name: 'mixed input',
        steps: [
          {
            ...fixture.steps[0]!,
            inputs: [
              {
                source: { kind: 'dataset', datasetVersionId: otherVersion.id },
                role: 'input',
                weight: 1,
                selection: {},
              },
            ],
          },
        ],
      },
    });
    expect(mixedInput.status).toBe(404);
    expect(
      (await harness.database.query('SELECT count(*)::int AS count FROM workflows')).rows[0].count,
    ).toBe(1);
  });

  it('scopeが足りないAPI tokenとService Accountは、作成・起動・停止を断られる', async () => {
    const definition = await fixture.createWorkflow();
    const execution = await fixture.launch(definition);
    async function personalToken(scopes: string[]): Promise<{ token: string }> {
      return entity<{ token: string }>(
        await request(harness.app, '/api/tokens', {
          method: 'POST',
          cookie: fixture.editor.cookie,
          body: { name: scopes.join(' '), projectId: fixture.project.id, scopes },
        }),
      );
    }
    const runsOnly = await personalToken(['read', 'runs:write']);
    const jobsOnly = await personalToken(['read', 'jobs:write']);
    const readOnly = await personalToken(['read']);
    for (const caller of [runsOnly, jobsOnly]) {
      expect(
        await errorCode(
          await launch(definition.workflow.id, caller, { idempotencyKey: 'scoped' }),
          403,
        ),
      ).toBe('scope_required');
      expect(await errorCode(await cancel(execution.id, caller), 403)).toBe('scope_required');
    }
    expect(
      await errorCode(
        await request(harness.app, `${fixture.basePath}/workflows`, {
          method: 'POST',
          token: readOnly.token,
          body: { name: 'read only', steps: fixture.steps },
        }),
        403,
      ),
    ).toBe('scope_required');

    const account = await entity<ServiceAccount>(
      await request(harness.app, `${fixture.basePath}/service-accounts`, {
        method: 'POST',
        cookie: fixture.administrator.cookie,
        body: { name: 'pipeline', description: 'starts workflows', role: 'editor' },
      }),
    );
    async function serviceAccountToken(scopes: string[]): Promise<{ token: string }> {
      return entity<{ token: string }>(
        await request(harness.app, `${fixture.basePath}/service-accounts/${account.id}/tokens`, {
          method: 'POST',
          cookie: fixture.administrator.cookie,
          body: { name: scopes.join(' '), scopes },
        }),
      );
    }
    const narrow = await serviceAccountToken(['read', 'runs:write']);
    expect(
      await errorCode(
        await launch(definition.workflow.id, narrow, { idempotencyKey: 'narrow' }),
        403,
      ),
    ).toBe('scope_required');
    const enough = await serviceAccountToken(['read', 'runs:write', 'jobs:write']);
    const started = await entity<WorkflowExecution>(
      await launch(definition.workflow.id, enough, { idempotencyKey: 'enough' }),
    );
    // The Service Account controls what it started, and not what a person started.
    expect(await errorCode(await cancel(execution.id, enough), 403)).toBe(
      'workflow_control_forbidden',
    );
    expect((await entity<WorkflowExecution>(await cancel(started.id, enough), 200)).status).toBe(
      'canceled',
    );
  });

  it('Job tokenではワークフローを読めるが、起動も停止もできない', async () => {
    const definition = await fixture.createWorkflow();
    const execution = await fixture.launch(definition);
    const job = await fixture.claim();
    const jobToken = { token: job.jobToken! };
    expect(
      await errorCode(
        await launch(definition.workflow.id, jobToken, { idempotencyKey: 'from-job' }),
        403,
      ),
    ).toBe('job_token_forbidden');
    expect(await errorCode(await cancel(execution.id, jobToken), 403)).toBe('job_token_forbidden');
    expect(
      (
        await request(harness.app, `${fixture.basePath}/workflow-executions/${execution.id}`, {
          token: job.jobToken!,
        })
      ).status,
    ).toBe(200);
    expect((await fixture.execution(execution.id)).status).toBe('running');
  });
});
