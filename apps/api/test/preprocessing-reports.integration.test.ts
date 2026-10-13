import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type {
  Artifact,
  ArtifactReferences,
  JsonObject,
  PreprocessingReport,
} from '@mmt/contracts';
import { preprocessingReportSchema, workflowExecutionSchema } from '@mmt/contracts/schemas';
import { createHarness, entity, request, testDatabaseUrl, type Harness } from './harness.js';
import {
  createPreprocessingReportInput,
  workflowFixture,
  type WorkflowFixture,
} from './workflowFixtures.js';

// Far beyond the accepted depth, including runtimes where JSON.stringify itself exhausts the stack.
const EXCESSIVE_METADATA_DEPTH = 10_000;

describe.skipIf(!testDatabaseUrl)('前処理レポートの品質と固定（独立PostgreSQL）', () => {
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

  it('同じレポートを再送してもバージョンとメトリクスを増やさず、終了後の変更は拒否する', async () => {
    const execution = await fixture.launch(await fixture.createWorkflow());
    const runId = execution.steps[0]!.runId!;
    const report = await entity<PreprocessingReport>(await fixture.report(runId), 200);
    expect(preprocessingReportSchema.safeParse(report).success).toBe(true);
    expect((await entity<PreprocessingReport>(await fixture.report(runId), 200)).revision).toBe(1);
    const metrics = await harness.database.query(
      'SELECT count(*)::int AS count FROM metrics WHERE run_id=$1',
      [runId],
    );
    expect(metrics.rows[0].count).toBe(5);
    await fixture.output(runId);
    await fixture.finish(await fixture.claim());
    expect((await entity<PreprocessingReport>(await fixture.report(runId), 200)).revision).toBe(1);
    expect((await fixture.report(runId, { outputCount: 9 })).status).toBe(409);
    expect(workflowExecutionSchema.safeParse(await fixture.execution(execution.id)).success).toBe(
      true,
    );
  });

  it('分割で出力が増えても保存できるが、除外・失敗の合計と理由内訳が合わなければ拒否する', async () => {
    const execution = await fixture.launch(await fixture.createWorkflow());
    const id = execution.steps[0]!.runId!;
    expect((await fixture.report(id, { outputCount: 100 })).status).toBe(200);
    expect(
      (
        await fixture.report(id, {
          excludedCount: 11,
          exclusions: [{ reason: 'too short', count: 11 }],
        })
      ).status,
    ).toBe(422);
    expect((await fixture.report(id, { exclusions: [] })).status).toBe(422);
    expect(
      (await fixture.report(id, { metrics: { 'preprocessing.input_count': 99 } })).status,
    ).toBe(422);
  });

  it('metadataは16KiB・入れ子10段までで、それより大きく深いレポートは保存しない', async () => {
    const execution = await fixture.launch(await fixture.createWorkflow());
    const id = execution.steps[0]!.runId!;
    function nested(depth: number): JsonObject {
      let value: JsonObject = {};
      for (let level = 1; level < depth; level++) value = { level: value };
      return value;
    }
    expect((await fixture.report(id, { metadata: nested(10) })).status).toBe(200);
    for (const metadata of [
      nested(11),
      { note: 'x'.repeat(16 * 1024) },
    ]) {
      const refused = await fixture.report(id, { metadata });
      expect(refused.status).toBe(422);
      expect(((await refused.json()) as { code: string }).code).toBe('invalid_request');
    }
    // Send raw JSON so the API's depth check runs before any client-side recursive serialization.
    const serializedReport = JSON.stringify(createPreprocessingReportInput());
    const serializedMetadata = '{"level":'.repeat(EXCESSIVE_METADATA_DEPTH)
      + '{}' + '}'.repeat(EXCESSIVE_METADATA_DEPTH);
    const deeplyNestedReport = await request(
      harness.app,
      `${fixture.basePath}/runs/${id}/preprocessing-report`,
      {
        method: 'PUT',
        cookie: fixture.editor.cookie,
        headers: { 'Content-Type': 'application/json' },
        binary: `${serializedReport.slice(0, -1)},"metadata":${serializedMetadata}}`,
      },
    );
    expect(deeplyNestedReport.status).toBe(422);
    expect(((await deeplyNestedReport.json()) as { code: string }).code).toBe('invalid_request');
    const stored = await entity<{ report: PreprocessingReport }>(
      await request(harness.app, `${fixture.basePath}/runs/${id}/preprocessing-report`, {
        cookie: fixture.viewer.cookie,
      }),
      200,
    );
    expect(stored.report.metadata).toEqual(nested(10));
  });

  it('最新レポートで未定義になった品質値を以前のメトリクスから補わない', async () => {
    const definition = await fixture.createWorkflow(
      fixture.steps.map((step, index) =>
        index
          ? step
          : {
              ...step,
              qualityGates: [
                { metric: 'preprocessing.retained_input_ratio', operator: 'gte', threshold: 0.7 },
              ],
            },
      ),
    );
    const execution = await fixture.launch(definition);
    const id = execution.steps[0]!.runId!;
    await entity(await fixture.report(id), 200);
    await entity(
      await fixture.report(id, { inputCount: 0, outputCount: 0, excludedCount: 0, exclusions: [] }),
      200,
    );
    await fixture.output(id);
    await fixture.finish(await fixture.claim());
    const ended = await fixture.execution(execution.id);
    expect(ended.status).toBe('failed');
    expect(ended.steps[0]!.metrics['preprocessing.retained_input_ratio']).toBeUndefined();
    expect(ended.steps[1]!.jobId).toBeNull();
  });

  it('レポートから削除した独自の品質値で後続Jobを起動しない', async () => {
    const definition = await fixture.createWorkflow(
      fixture.steps.map((step, index) =>
        index
          ? step
          : {
              ...step,
              qualityGates: [{ metric: 'snr_mean', operator: 'gte', threshold: 20 }],
            },
      ),
    );
    const execution = await fixture.launch(definition);
    const runId = execution.steps[0]!.runId!;
    await entity(await fixture.report(runId, { metrics: { snr_mean: 21.5 } }), 200);
    await entity(await fixture.report(runId, { metrics: {} }), 200);
    await fixture.output(runId);
    await fixture.finish(await fixture.claim());
    const ended = await fixture.execution(execution.id);
    expect(ended.status).toBe('failed');
    expect(ended.steps[0]!.metrics.snr_mean).toBeUndefined();
    expect(ended.steps[0]!.error).toContain('snr_mean');
    expect(ended.steps[1]!.jobId).toBeNull();
  });

  it('現在のRunのサンプルだけを受け付け、レポートが参照するArtifactを削除させない', async () => {
    const execution = await fixture.launch(await fixture.createWorkflow());
    const runId = execution.steps[0]!.runId!;
    const sample = await entity<Artifact>(
      await request(harness.app, `${fixture.basePath}/runs/${runId}/artifacts?path=sample.txt`, {
        method: 'PUT',
        cookie: fixture.editor.cookie,
        binary: 'sample',
      }),
    );
    await entity(await fixture.report(runId, { sampleArtifactIds: [sample.id] }), 200);
    const references = await entity<{ items: ArtifactReferences[] }>(
      await request(
        harness.app,
        `${fixture.basePath}/artifact-references?artifactIds=${sample.id}`,
        { cookie: fixture.viewer.cookie },
      ),
      200,
    );
    expect(references.items[0]!.preprocessingReports).toEqual([{ runId, runName: '前処理' }]);
    expect(
      (
        await request(harness.app, `${fixture.basePath}/artifacts/${sample.id}`, {
          method: 'DELETE',
          cookie: fixture.administrator.cookie,
        })
      ).status,
    ).toBe(409);
    await entity(await fixture.report(runId, { sampleArtifactIds: [] }), 200);
    expect(
      (
        await request(harness.app, `${fixture.basePath}/artifacts/${sample.id}`, {
          method: 'DELETE',
          cookie: fixture.administrator.cookie,
        })
      ).status,
    ).toBe(200);
    expect((await fixture.report(runId, { sampleArtifactIds: [sample.id] })).status).toBe(422);
  });

  it('Jobトークンは自分の前処理レポートだけを書ける', async () => {
    const execution = await fixture.launch(await fixture.createWorkflow());
    const job = await fixture.claim();
    const body = { inputCount: 1, outputCount: 1, excludedCount: 0, failedCount: 0 };
    const own = await request(
      harness.app,
      `${fixture.basePath}/runs/${job.run.id}/preprocessing-report`,
      { method: 'PUT', token: job.jobToken!, body },
    );
    expect(own.status).toBe(200);
    const otherExecution = await fixture.launch(await fixture.createWorkflow(), {
      idempotencyKey: 'other',
    });
    const other = await request(
      harness.app,
      `${fixture.basePath}/runs/${otherExecution.steps[0]!.runId}/preprocessing-report`,
      { method: 'PUT', token: job.jobToken!, body },
    );
    expect(other.status).toBe(403);
    expect((await fixture.execution(execution.id)).steps[0]!.runId).toBe(job.run.id);
  });

  it('Projectの完全な削除ではワークフローとレポートとサンプル参照も削除する', async () => {
    const execution = await fixture.launch(await fixture.createWorkflow());
    const runId = execution.steps[0]!.runId!;
    const sample = await entity<Artifact>(
      await request(harness.app, `${fixture.basePath}/runs/${runId}/artifacts?path=sample.txt`, {
        method: 'PUT',
        cookie: fixture.editor.cookie,
        binary: 'sample',
      }),
    );
    await entity(await fixture.report(runId, { sampleArtifactIds: [sample.id] }), 200);
    await entity(
      await request(harness.app, `${fixture.basePath}/workflow-executions/${execution.id}/cancel`, {
        method: 'POST',
        cookie: fixture.editor.cookie,
      }),
      200,
    );
    expect(
      (
        await request(harness.app, `${fixture.basePath}/archive`, {
          method: 'POST',
          cookie: fixture.administrator.cookie,
        })
      ).status,
    ).toBe(204);
    expect(
      (
        await request(harness.app, `/api/admin/projects/${fixture.project.id}`, {
          method: 'DELETE',
          cookie: fixture.administrator.cookie,
        })
      ).status,
    ).toBe(204);
    for (const table of [
      'workflows',
      'workflow_versions',
      'workflow_version_inputs',
      'workflow_executions',
      'workflow_step_runs',
      'preprocessing_reports',
      'preprocessing_report_samples',
    ])
      expect(
        (await harness.database.query(`SELECT count(*)::int AS count FROM ${table}`)).rows[0].count,
      ).toBe(0);
  });
});
