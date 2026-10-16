import type {
  CodeVersion,
  CodeVersionDetail,
  Model,
  ModelFamilySummary,
  ModelVersion,
  Project,
  Run,
  RuleMetricKeys,
} from '@mmt/contracts';
import {
  codeVersionDetailSchema,
  modelFamilySummarySchema,
  modelSchema,
  ruleMetricKeysSchema,
} from '@mmt/contracts/schemas';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { executionFixture } from './fixtures.js';
import { createHarness, entity, request, testDatabaseUrl, type Harness } from './harness.js';
import { promotionFixture } from './promotionFixtures.js';

describe.skipIf(!testDatabaseUrl)('登録画面の候補と表示名の問い合わせ（独立PostgreSQL）', () => {
  let harness: Harness;

  beforeAll(async () => {
    harness = await createHarness();
  });
  afterAll(async () => harness?.close());
  beforeEach(async () => harness.reset());

  it('モデル系列はモデルとコードバージョンの両方から集め、大文字小文字だけ違う系列を隣に並べる', async () => {
    const fixture = await executionFixture(harness);
    const { basePath, editor } = fixture;
    for (const family of ['qwen3', 'Qwen3'])
      await entity<Model>(
        await request(harness.app, `${basePath}/models`, {
          method: 'POST',
          cookie: editor.cookie,
          body: { name: `model-${family}`, family },
        }),
      );
    await entity<CodeVersion>(
      await request(harness.app, `${basePath}/codes/${fixture.code.id}/versions`, {
        method: 'POST',
        cookie: editor.cookie,
        body: {
          version: 'v2',
          source: { kind: 'inline', files: { 'main.py': 'print(1)\n' } },
          entrypoint: ['python', 'main.py'],
          supportedModelFamilies: ['qwen2', 'Qwen3'],
          taskTypes: ['inference'],
        },
      }),
    );
    const families = await entity<{ items: ModelFamilySummary[] }>(
      await request(harness.app, `${basePath}/model-families`, { cookie: fixture.viewer.cookie }),
      200,
    );
    // The published (strict) schema, so a field the document lacks fails here.
    families.items.forEach((family) => modelFamilySummarySchema.parse(family));
    expect(families.items).toEqual([
      { name: 'qwen2', modelCount: 1, codeVersionCount: 2 },
      { name: 'Qwen3', modelCount: 1, codeVersionCount: 1 },
      { name: 'qwen3', modelCount: 1, codeVersionCount: 0 },
    ]);
  });

  it('read scope の token（人・Service Account）と、Public にしたプロジェクトのメンバーでない人には返す', async () => {
    const fixture = await executionFixture(harness);
    const { basePath } = fixture;
    const minted = await entity<{ token: string }>(
      await request(harness.app, '/api/tokens', {
        method: 'POST',
        cookie: fixture.viewer.cookie,
        body: { name: 'Lookup token', projectId: fixture.project.id, scopes: ['read'] },
      }),
    );
    const paths = [`${basePath}/model-families`, `${basePath}/code-versions/${fixture.codeVersion.id}`];
    for (const path of paths)
      expect((await request(harness.app, path, { token: minted.token })).status).toBe(200);
    // A viewer Service Account reads them with its read token, like a person.
    const account = await entity<{ id: string }>(
      await request(harness.app, `${basePath}/service-accounts`, {
        method: 'POST',
        cookie: fixture.administrator.cookie,
        body: { name: 'lookup-bot', role: 'viewer', description: 'reads candidates' },
      }),
    );
    const accountToken = await entity<{ token: string }>(
      await request(harness.app, `${basePath}/service-accounts/${account.id}/tokens`, {
        method: 'POST',
        cookie: fixture.administrator.cookie,
        body: { name: 'lookup-bot key', scopes: ['read'] },
      }),
    );
    for (const path of paths)
      expect((await request(harness.app, path, { token: accountToken.token })).status).toBe(200);
    await entity<Project>(
      await request(harness.app, basePath, {
        method: 'PATCH',
        cookie: fixture.administrator.cookie,
        body: { visibility: 'public' },
      }),
      200,
    );
    for (const path of paths)
      expect((await request(harness.app, path, { cookie: fixture.outsider.cookie })).status).toBe(200);
  });

  it('候補はメンバーでない人と read scope の無い token には返さない', async () => {
    const fixture = await executionFixture(harness);
    const { basePath } = fixture;
    for (const path of [
      `${basePath}/model-families`,
      `${basePath}/code-versions/${fixture.codeVersion.id}`,
    ]) {
      expect((await request(harness.app, path, { cookie: fixture.outsider.cookie })).status).toBe(
        403,
      );
      // The worker token of the fixture holds only worker:execute.
      expect((await request(harness.app, path, { token: fixture.workerToken })).status).toBe(403);
    }
  });

  it('コードバージョンはコードと一緒に返し、別プロジェクトのIDは404にする', async () => {
    const fixture = await executionFixture(harness);
    const detail = await entity<CodeVersionDetail>(
      await request(harness.app, `${fixture.basePath}/code-versions/${fixture.codeVersion.id}`, {
        cookie: fixture.viewer.cookie,
      }),
      200,
    );
    codeVersionDetailSchema.parse(detail);
    expect(detail.code).toMatchObject({ id: fixture.code.id, name: 'CPU Test Code' });
    expect(detail.version).toEqual(fixture.codeVersion);
    const otherProject = await entity<Project>(
      await request(harness.app, '/api/projects', {
        method: 'POST',
        cookie: fixture.administrator.cookie,
        body: { name: 'Other Project', visibility: 'private' },
      }),
    );
    expect(
      (
        await request(
          harness.app,
          `/api/projects/${otherProject.id}/code-versions/${fixture.codeVersion.id}`,
          { cookie: fixture.administrator.cookie },
        )
      ).status,
    ).toBe(404);
  });

  it('モデルは次に自動で付くバージョンを返し、省略して登録するとその番号になる', async () => {
    const fixture = await executionFixture(harness);
    const { basePath, editor, model } = fixture;
    const modelPath = `${basePath}/models/${model.id}`;
    const before = await entity<Model>(
      await request(harness.app, modelPath, { cookie: fixture.viewer.cookie }),
      200,
    );
    modelSchema.parse(before);
    expect(before.nextVersion).toBe('1');
    const numbered = await entity<ModelVersion>(
      await request(harness.app, `${modelPath}/versions`, {
        method: 'POST',
        cookie: editor.cookie,
        body: {},
      }),
    );
    expect(numbered.version).toBe(before.nextVersion);
    // An explicit integer moves the counter past itself.
    await entity<ModelVersion>(
      await request(harness.app, `${modelPath}/versions`, {
        method: 'POST',
        cookie: editor.cookie,
        body: { version: '7' },
      }),
    );
    const after = await entity<Model>(
      await request(harness.app, modelPath, { cookie: fixture.viewer.cookie }),
      200,
    );
    expect(after.nextVersion).toBe('8');
  });

  it('ruleの指標名は、ruleの評価Run、無ければ同じコードバージョンのRunから取り、どちらも無ければnone', async () => {
    const fixture = await promotionFixture(harness);
    const { basePath, editor, viewer } = fixture;
    const rule = await fixture.registerEvaluationRule('Evaluate');
    const metricKeysPath = `${basePath}/automation-rules/${rule.id}/metric-keys`;
    const metricKeys = async (auth: { cookie?: string; token?: string }) =>
      entity<RuleMetricKeys>(await request(harness.app, metricKeysPath, auth), 200);
    expect(ruleMetricKeysSchema.parse(await metricKeys({ cookie: viewer.cookie }))).toEqual({
      items: [],
      source: 'none',
    });

    // A hand-made evaluation with the rule's code version stands in until the rule has Runs.
    const manual = await entity<Run>(
      await request(harness.app, `${basePath}/runs`, {
        method: 'POST',
        cookie: editor.cookie,
        body: {
          experimentId: fixture.experiment.id,
          name: 'Manual evaluation',
          kind: 'evaluation',
          codeVersionId: rule.codeVersionId,
          modelVersionId: fixture.modelVersion.id,
        },
      }),
    );
    expect(
      (
        await request(harness.app, `${basePath}/runs/${manual.id}/metrics`, {
          method: 'POST',
          cookie: editor.cookie,
          body: {
            metrics: [
              { name: 'manual.cer', value: 0.2, step: 0, timestamp: new Date().toISOString() },
            ],
          },
        })
      ).status,
    ).toBe(204);
    expect(await metricKeys({ cookie: viewer.cookie })).toEqual({
      items: ['manual.cer'],
      source: 'code_version_runs',
    });

    const version = await fixture.registerVersion('2');
    const { jobId } = await fixture.automaticJob(rule, version);
    await fixture.completeJob(jobId, {
      status: 'finished',
      metrics: { accuracy: 0.9, 'evaluation.duration_match_rate': 0.97 },
    });
    expect(await metricKeys({ cookie: viewer.cookie })).toEqual({
      items: ['accuracy', 'evaluation.duration_match_rate'],
      source: 'rule_runs',
    });
    expect((await request(harness.app, metricKeysPath, { cookie: fixture.outsider.cookie })).status).toBe(
      403,
    );
    expect(
      (
        await request(
          harness.app,
          `${basePath}/automation-rules/${fixture.modelVersion.id}/metric-keys`,
          { cookie: viewer.cookie },
        )
      ).status,
    ).toBe(404);
  });
});
