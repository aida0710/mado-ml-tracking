import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { WorkflowDetail, WorkflowStepInput, WorkflowVersionPage } from '@mmt/contracts';
import { WORKFLOW_VERSIONS_PAGE_SIZE } from '@mmt/contracts';
import { createHarness, entity, request, testDatabaseUrl, type Harness } from './harness.js';
import { workflowFixture, type WorkflowFixture } from './workflowFixtures.js';

describe.skipIf(!testDatabaseUrl)('ワークフローの定義とバージョン（独立PostgreSQL）', () => {
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

  function saveVersion(workflowId: string, expectedRevision: number, steps = fixture.steps) {
    return request(harness.app, `${fixture.basePath}/workflows/${workflowId}/versions`, {
      method: 'POST',
      cookie: fixture.editor.cookie,
      body: { expectedRevision, steps },
    });
  }

  function createWorkflow(steps: WorkflowStepInput[]) {
    return request(harness.app, `${fixture.basePath}/workflows`, {
      method: 'POST',
      cookie: fixture.editor.cookie,
      body: { name: 'checked on save', steps },
    });
  }

  async function errorCode(response: Response, status: number): Promise<string> {
    expect(response.status).toBe(status);
    return ((await response.json()) as { code: string }).code;
  }

  it('詳細は新しいバージョンから20件だけを返し、それより前はcursorで20件ずつ読める', async () => {
    const workflowId = (await fixture.createWorkflow()).workflow.id;
    const versionCount = WORKFLOW_VERSIONS_PAGE_SIZE + 5;
    for (let revision = 1; revision < versionCount; revision++)
      await entity(await saveVersion(workflowId, revision));

    const detail = await entity<WorkflowDetail>(
      await request(harness.app, `${fixture.basePath}/workflows/${workflowId}`, {
        cookie: fixture.viewer.cookie,
      }),
      200,
    );
    expect(detail.versions.map((version) => version.revision)).toEqual(
      Array.from({ length: WORKFLOW_VERSIONS_PAGE_SIZE }, (_, index) => versionCount - index),
    );
    expect(detail.olderVersionsCursor).toBe(detail.versions.at(-1)!.id);
    const older = await entity<WorkflowVersionPage>(
      await request(
        harness.app,
        `${fixture.basePath}/workflows/${workflowId}/versions?cursor=${detail.olderVersionsCursor}`,
        { cookie: fixture.viewer.cookie },
      ),
      200,
    );
    expect(older.items.map((version) => version.revision)).toEqual([5, 4, 3, 2, 1]);
    expect(older.nextCursor).toBeNull();

    // A cursor that is not a version of this workflow is refused, not read as "from the start".
    const otherWorkflow = await fixture.createWorkflow();
    for (const cursor of [otherWorkflow.versions[0]!.id, crypto.randomUUID()])
      expect(
        (
          await request(
            harness.app,
            `${fixture.basePath}/workflows/${workflowId}/versions?cursor=${cursor}`,
            { cookie: fixture.viewer.cookie },
          )
        ).status,
      ).toBe(404);
  });

  it('記録されない前処理の指標を品質条件にした定義は、作成も新しいバージョンも保存できない', async () => {
    const misspelled: WorkflowStepInput[] = [
      {
        ...fixture.steps[0]!,
        qualityGates: [{ metric: 'preprocessing.retained_ratio', operator: 'gte', threshold: 0.9 }],
      },
      fixture.steps[1]!,
    ];
    expect(await errorCode(await createWorkflow(misspelled), 422)).toBe(
      'workflow_quality_metric_unknown',
    );
    const workflowId = (await fixture.createWorkflow()).workflow.id;
    expect(await errorCode(await saveVersion(workflowId, 1, misspelled), 422)).toBe(
      'workflow_quality_metric_unknown',
    );
    // Summary metrics and the step's own metrics are accepted.
    misspelled[0]!.qualityGates = [
      { metric: 'preprocessing.retained_input_ratio', operator: 'gte', threshold: 0.9 },
      { metric: 'snr_db', operator: 'gte', threshold: 10 },
    ];
    expect((await saveVersion(workflowId, 1, misspelled)).status).toBe(201);
  });

  it('出力モデルを登録しないステップからモデルを受け取る定義は保存できない', async () => {
    const evaluation = await fixture.task('evaluation');
    const evaluate: WorkflowStepInput = {
      key: 'evaluate',
      name: '評価',
      taskId: evaluation.id,
      expectedTaskRevision: evaluation.revision,
      inputs: [],
      modelFromStepKey: 'train',
      qualityGates: [],
    };
    expect(await errorCode(await createWorkflow([...fixture.steps, evaluate]), 422)).toBe(
      'workflow_model_source_unregistered',
    );
    const registering = await fixture.task('training', {
      outputModel: { modelId: fixture.model.id, createModel: null, artifactPath: 'weights.bin' },
    });
    const train = {
      ...fixture.steps[1]!,
      taskId: registering.id,
      expectedTaskRevision: registering.revision,
    };
    expect((await createWorkflow([fixture.steps[0]!, train, evaluate])).status).toBe(201);
  });

  it('固定した入力とバージョンは消せず書き換えられず、実行はほかのバージョンを名乗れない', async () => {
    const definition = await fixture.createWorkflow();
    const version = definition.versions[0]!;
    await entity(await saveVersion(definition.workflow.id, 1));
    const execution = await fixture.launch(definition);
    const refusals: [string, unknown[]][] = [
      ['DELETE FROM workflow_version_inputs WHERE workflow_version_id=$1', [version.id]],
      [
        `UPDATE workflow_version_inputs SET dataset_version_id=gen_random_uuid()
        WHERE workflow_version_id=$1`,
        [version.id],
      ],
      ["UPDATE workflow_versions SET steps='[]' WHERE id=$1", [version.id]],
    ];
    for (const [statement, values] of refusals)
      await expect(harness.database.query(statement, values)).rejects.toMatchObject({
        code: '23514',
      });
    // A version nothing else refers to is kept as well.
    const unused = await entity<WorkflowDetail>(
      await createWorkflow([{ ...fixture.steps[0]!, inputs: [] }]),
    );
    await expect(
      harness.database.query('DELETE FROM workflow_versions WHERE id=$1', [unused.versions[0]!.id]),
    ).rejects.toMatchObject({ code: '23514' });
    // The execution's revision and workflow are those of its version.
    for (const [statement, values] of [
      ['UPDATE workflow_executions SET revision=2 WHERE id=$1', [execution.id]],
      [
        'UPDATE workflow_executions SET workflow_id=$2 WHERE id=$1',
        [execution.id, unused.workflow.id],
      ],
    ] as [string, unknown[]][])
      await expect(harness.database.query(statement, values)).rejects.toMatchObject({
        code: '23503',
      });
  });
});
