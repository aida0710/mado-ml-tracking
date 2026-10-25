import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { WorkflowExecution } from '@mmt/contracts';
import { DomainError } from '../src/domain/errors.js';
import {
  WORKFLOW_STEP_LAUNCH_MAX_FAILURES,
  WORKFLOW_STEP_LAUNCH_RETRY_DELAY_SECONDS,
} from '../src/domain/workflowStepLaunchRetry.js';
import { WorkflowExecutor } from '../src/services/workflowExecutor.js';
import { WorkflowScheduler } from '../src/services/workflowScheduler.js';
import { createHarness, entity, request, testDatabaseUrl, type Harness } from './harness.js';
import { workflowFixture, type WorkflowFixture } from './workflowFixtures.js';

/** What the scheduler logged, one parsed JSON event per console.error call. */
function loggedEvents(logged: { mock: { calls: unknown[][] } }): Record<string, unknown>[] {
  return logged.mock.calls.map(([line]) => JSON.parse(String(line)) as Record<string, unknown>);
}

// PostgreSQL's answer when an administrator stops the server; its message names the query.
const ADMINISTRATOR_SHUTDOWN = '57P01';
function databaseShutdownError(): Error {
  return Object.assign(
    new Error('terminating connection due to administrator command: SELECT secret_value'),
    { code: ADMINISTRATOR_SHUTDOWN },
  );
}

describe.skipIf(!testDatabaseUrl)('ワークフローの停止と起動の失敗からの回復（独立PostgreSQL）', () => {
  let harness: Harness;
  let fixture: WorkflowFixture;
  beforeAll(async () => {
    harness = await createHarness();
  });
  beforeEach(async () => {
    await harness.reset();
    fixture = await workflowFixture(harness);
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });
  afterAll(async () => {
    await harness?.close();
  });

  function cancel(executionId: string) {
    return request(harness.app, `${fixture.basePath}/workflow-executions/${executionId}/cancel`, {
      method: 'POST',
      cookie: fixture.editor.cookie,
    });
  }

  /** The next step's launch fails once with an error that is not a refusal. */
  function failNextLaunchWithDatabaseError() {
    return vi
      .spyOn(harness.services.tasks, 'launchTaskInTransaction')
      .mockRejectedValueOnce(databaseShutdownError());
  }

  /** Time passes until a step whose launch failed is due to be launched again. */
  async function passLaunchRetryDelay() {
    await harness.database.query(
      `UPDATE workflow_step_runs SET launch_failed_at=launch_failed_at-make_interval(secs=>$1)
      WHERE launch_failed_at IS NOT NULL`,
      [WORKFLOW_STEP_LAUNCH_RETRY_DELAY_SECONDS],
    );
  }

  it('停止の前にJobが成功していれば、そのステップは成功として残り、再開で再利用される', async () => {
    const definition = await fixture.createWorkflow();
    const execution = await fixture.launch(definition);
    const processing = await fixture.claim();
    const output = await fixture.output(processing.run.id);
    // The Job ends before the scheduler looks, and the person stops the execution in between.
    await fixture.complete(processing);
    const canceled = await entity<WorkflowExecution>(await cancel(execution.id), 200);
    expect(canceled.status).toBe('canceled');
    expect(canceled.steps.map((step) => step.status)).toEqual(['finished', 'canceled']);
    expect(canceled.steps[0]!.outputDatasetVersionIds).toEqual([output.id]);

    const resumed = await fixture.launch(definition, {
      idempotencyKey: 'resume-after-stop',
      resumeFromExecutionId: execution.id,
    });
    expect(resumed.steps[0]).toMatchObject({ reused: true, runId: processing.run.id });
    expect(resumed.steps[1]!.status).toBe('queued');
  });

  it('停止の前にJobが失敗していれば、そのステップは停止ではなく失敗として残る', async () => {
    const execution = await fixture.launch(await fixture.createWorkflow());
    await fixture.complete(await fixture.claim(), 'failed');
    const canceled = await entity<WorkflowExecution>(await cancel(execution.id), 200);
    expect(canceled.status).toBe('canceled');
    expect(canceled.steps.map((step) => step.status)).toEqual(['failed', 'canceled']);
  });

  it('後段の起動がDBの一時的なエラーで失敗しても実行を終わらせず、待ってから起動し直す', async () => {
    const execution = await fixture.launch(await fixture.createWorkflow());
    const processing = await fixture.claim();
    await fixture.output(processing.run.id);
    const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const launches = failNextLaunchWithDatabaseError();
    await fixture.finish(processing);

    // The first step's end is kept; only the launch of the next one is undone.
    const waiting = await fixture.execution(execution.id);
    expect(waiting).toMatchObject({ status: 'running', error: null });
    expect(waiting.steps.map((step) => step.status)).toEqual(['finished', 'pending']);
    expect(waiting.steps[1]).toMatchObject({ runId: null, error: null });
    expect(loggedEvents(logged)).toContainEqual({
      event: 'workflow_step_launch_failed',
      executionId: execution.id,
      stepKey: 'train',
      code: 'internal_error',
      errorName: 'Error',
      errorCode: ADMINISTRATOR_SHUTDOWN,
      failures: 1,
      retrying: true,
    });
    // The message of the database error is not logged; it can hold SQL text.
    expect(JSON.stringify(logged.mock.calls)).not.toContain('secret_value');

    // The next pass comes within seconds, which a passing outage would not survive.
    await harness.workflowScheduler.tick();
    expect(launches).toHaveBeenCalledTimes(1);
    await passLaunchRetryDelay();
    await harness.workflowScheduler.tick();
    const launched = await fixture.execution(execution.id);
    expect(launched.steps.map((step) => step.status)).toEqual(['finished', 'queued']);
  });

  it('起動が続けて失敗すると、APIのプロセスが替わっても数え続け、上限の回数で実行を失敗にする', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const launches = vi
      .spyOn(harness.services.tasks, 'launchTaskInTransaction')
      .mockImplementation(() => Promise.reject(databaseShutdownError()));
    // The launch request makes the first attempt; the execution waits for the scheduler.
    const execution = await fixture.launch(await fixture.createWorkflow());
    expect(execution).toMatchObject({ status: 'running', error: null });
    // Another API process, or this one after a restart, picks up the count from the database.
    const otherProcess = new WorkflowScheduler(
      harness.database,
      new WorkflowExecutor(harness.services.tasks),
    );
    for (let attempt = 2; attempt <= WORKFLOW_STEP_LAUNCH_MAX_FAILURES; attempt++) {
      expect((await fixture.execution(execution.id)).status).toBe('running');
      await passLaunchRetryDelay();
      await (attempt % 2 ? harness.workflowScheduler : otherProcess).tick();
    }
    expect(launches).toHaveBeenCalledTimes(WORKFLOW_STEP_LAUNCH_MAX_FAILURES);

    const failed = await fixture.execution(execution.id);
    const reason =
      `ステップの起動が${WORKFLOW_STEP_LAUNCH_MAX_FAILURES}回続けて失敗したため、実行を止めました。` +
      `最後の理由: APIの内部エラー（Error ${ADMINISTRATOR_SHUTDOWN}）`;
    expect(failed).toMatchObject({ status: 'failed', error: reason });
    expect(failed.steps.map((step) => [step.status, step.error])).toEqual([
      ['failed', reason],
      ['pending', null],
    ]);
    expect(loggedEvents(logged).at(-1)).toMatchObject({
      event: 'workflow_step_launch_failed',
      failures: WORKFLOW_STEP_LAUNCH_MAX_FAILURES,
      retrying: false,
    });
    await passLaunchRetryDelay();
    expect(await harness.workflowScheduler.tick()).toBe(0);
  });

  it('5xxの断り（imageのregistryに届かない）は起動し直し、4xxの断りはすぐに実行を失敗にする', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const definition = await fixture.createWorkflow();
    const launches = vi
      .spyOn(harness.services.tasks, 'launchTaskInTransaction')
      .mockRejectedValueOnce(
        new DomainError({
          status: 503,
          code: 'image_registry_unavailable',
          message: 'the image registry cannot be queried',
        }),
      );
    const unavailable = await fixture.launch(definition, { idempotencyKey: 'registry-down' });
    expect(unavailable).toMatchObject({ status: 'running', error: null });
    expect(loggedEvents(logged)).toContainEqual(
      expect.objectContaining({ code: 'image_registry_unavailable', failures: 1, retrying: true }),
    );
    await passLaunchRetryDelay();
    await harness.workflowScheduler.tick();
    expect((await fixture.execution(unavailable.id)).steps[0]!.status).toBe('queued');

    launches.mockRejectedValueOnce(
      new DomainError({
        status: 403,
        code: 'workflow_owner_unavailable',
        message: 'the permission of the user who ran it is no longer valid',
      }),
    );
    const refused = await fixture.launch(definition, { idempotencyKey: 'owner-gone' });
    expect(refused).toMatchObject({
      status: 'failed',
      error: 'the permission of the user who ran it is no longer valid',
    });
    expect(refused.steps[0]).toMatchObject({
      status: 'failed',
      error: 'the permission of the user who ran it is no longer valid',
    });
  });

  it('一つの実行の進行に失敗しても、同じ確認でほかの実行は進む', async () => {
    const definition = await fixture.createWorkflow();
    const first = await fixture.launch(definition, { idempotencyKey: 'first' });
    const second = await fixture.launch(definition, { idempotencyKey: 'second' });
    // One worker takes one Job at a time, so each first step ends before the next is claimed.
    for (const name of ['Processed first', 'Processed second']) {
      const job = await fixture.claim();
      await fixture.output(job.run.id, name);
      await fixture.complete(job);
    }
    const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.spyOn(WorkflowExecutor.prototype, 'advance').mockRejectedValueOnce(
      new Error('Connection terminated unexpectedly'),
    );
    // The older execution comes first and fails; the other still advances in the same pass.
    expect(await harness.workflowScheduler.tick()).toBe(1);
    expect((await fixture.execution(first.id)).steps[1]!.status).toBe('pending');
    expect((await fixture.execution(second.id)).steps[1]!.status).toBe('queued');
    expect(loggedEvents(logged)).toContainEqual({
      event: 'workflow_advance_failed',
      executionId: first.id,
      errorName: 'Error',
      errorCode: null,
    });
  });
});
