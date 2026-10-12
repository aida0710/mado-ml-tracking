import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { WorkflowExecution } from '@mmt/contracts';
import { WorkflowExecutor } from '../src/services/workflowExecutor.js';
import { createHarness, entity, request, testDatabaseUrl, type Harness } from './harness.js';
import { workflowFixture, type WorkflowFixture } from './workflowFixtures.js';

/** What the scheduler logged, one parsed JSON event per console.error call. */
function loggedEvents(logged: { mock: { calls: unknown[][] } }): Record<string, unknown>[] {
  return logged.mock.calls.map(([line]) => JSON.parse(String(line)) as Record<string, unknown>);
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
      .mockRejectedValueOnce(new Error('Connection terminated unexpectedly'));
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

  it('後段の起動がDBの一時的なエラーで失敗しても実行を終わらせず、次の確認で起動する', async () => {
    const execution = await fixture.launch(await fixture.createWorkflow());
    const processing = await fixture.claim();
    await fixture.output(processing.run.id);
    const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    failNextLaunchWithDatabaseError();
    await fixture.finish(processing);

    // Nothing of the failed pass is kept: the first step's end is recorded again next time.
    const waiting = await fixture.execution(execution.id);
    expect(waiting).toMatchObject({ status: 'running', error: null });
    expect(waiting.steps[1]).toMatchObject({ status: 'pending', runId: null, error: null });
    expect(loggedEvents(logged)).toContainEqual({
      event: 'workflow_step_launch_failed',
      executionId: execution.id,
      stepKey: 'train',
      code: 'internal_error',
    });
    // The message of the database error is not logged; it can hold SQL text.
    expect(JSON.stringify(logged.mock.calls)).not.toContain('Connection terminated');

    await harness.workflowScheduler.tick();
    const launched = await fixture.execution(execution.id);
    expect(launched.steps.map((step) => step.status)).toEqual(['finished', 'queued']);
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
    });
  });
});
