import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { promisify } from 'node:util';
import { serve } from '@hono/node-server';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createHarness, entity, request, testDatabaseUrl, type Harness } from './harness.js';
import { modelFixture, type ModelFixture, type VersionResponse } from './mlflow-models-fixtures.js';
import { mlflowSdkPythonPath } from './mlflow-sdk-fixtures.js';

// 0 lets the OS choose; set it to keep the SDK test on an allowed port range.
const SDK_TEST_HTTP_PORT = Number(process.env.MMT_TEST_HTTP_PORT ?? 0);
// The page sizes this API serves (MAX_MODEL_PAGE_SIZE, metric history's page size).
const MODEL_PAGE_SIZE = 1000;
const METRIC_HISTORY_PAGE_SIZE = 50000;
// What the official client sends without max_results (MLflow 3.0.0 to 3.17.0).
const SDK_MODEL_VERSION_MAX_RESULTS = '10000';
const SDK_REGISTERED_MODEL_MAX_RESULTS = '100';
const SDK_METRIC_HISTORY_MAX_RESULTS = '25000';
// The filter MLflow 3 clients append to every search_registered_models call.
const SDK_PROMPT_EXCLUSION = "tag.`mlflow.prompt.is_prompt` != 'true'";

type VersionPage = { model_versions: VersionResponse['model_version'][]; next_page_token?: string };
type ModelPage = { registered_models: { name: string }[]; next_page_token?: string };

describe.skipIf(!testDatabaseUrl)('公式MLflowライブラリが送る形の検索', () => {
  let harness: Harness;
  let fixture: ModelFixture;
  beforeAll(async () => {
    harness = await createHarness();
  });
  beforeEach(async () => {
    await harness.reset();
    fixture = await modelFixture(harness);
  });
  afterAll(async () => {
    await harness?.close();
  });

  // Registering one version runs the whole native flow, so paging checks add plain version rows.
  async function addVersionRows(modelName: string, count: number): Promise<void> {
    await harness.database.query(
      `INSERT INTO model_versions(model_id,project_id,version)
      SELECT m.id,m.project_id,g::text FROM models m, generate_series(1,$2::int) g WHERE m.name=$1`,
      [modelName, count],
    );
  }

  async function searchVersions(query: Record<string, string>) {
    const endpoint = `${fixture.versionEndpoint}/search?${new URLSearchParams(query)}`;
    return request(fixture.app, endpoint, { cookie: fixture.viewer.cookie });
  }

  async function searchModels(query: Record<string, string>) {
    const endpoint = `${fixture.registryEndpoint}/search?${new URLSearchParams(query)}`;
    return request(fixture.app, endpoint, { cookie: fixture.viewer.cookie });
  }

  async function versionNumbers(query: Record<string, string>): Promise<string[]> {
    const page = await entity<VersionPage>(await searchVersions(query), 200);
    return page.model_versions.map((version) => version.version);
  }

  it('search_model_versionsを件数の指定なし（max_results=10000）で呼ぶと、1000件で切って続きのページの印を返す', async () => {
    await entity(await fixture.createRegistered('Bulk'), 200);
    await addVersionRows('Bulk', MODEL_PAGE_SIZE + 1);
    const filter = "name = 'Bulk'";
    const first = await entity<VersionPage>(
      await searchVersions({ filter, max_results: SDK_MODEL_VERSION_MAX_RESULTS }),
      200,
    );
    expect(first.model_versions).toHaveLength(MODEL_PAGE_SIZE);
    expect(first.next_page_token).toEqual(expect.any(String));
    // mlflow.search_model_versions(max_results=N) asks for the remainder on the next page.
    for (const maxResults of [SDK_MODEL_VERSION_MAX_RESULTS, '9000']) {
      const rest = await entity<VersionPage>(
        await searchVersions({
          filter,
          max_results: maxResults,
          page_token: first.next_page_token!,
        }),
        200,
      );
      expect(rest.model_versions).toHaveLength(1);
      expect(rest.next_page_token).toBeUndefined();
      const seen = new Set(
        [...first.model_versions, ...rest.model_versions].map((version) => version.version),
      );
      expect(seen.size).toBe(MODEL_PAGE_SIZE + 1);
    }
  });

  it('max_resultsはMLflowのサーバーが受け付ける上限まで通り、それを超えるとMLflowと同じく断る', async () => {
    await entity(await fixture.createRegistered('Classifier'), 200);
    expect((await searchVersions({ max_results: '200000' })).status).toBe(200);
    expect((await searchVersions({ max_results: '200001' })).status).toBe(422);
    expect((await searchModels({ max_results: '1000' })).status).toBe(200);
    expect((await searchModels({ max_results: '1001' })).status).toBe(422);
    const loggedModels = await request(fixture.app, `${fixture.modelEndpoint}/search`, {
      method: 'POST',
      cookie: fixture.viewer.cookie,
      // mlflow.search_logged_models(max_results=5000) sends it as is; MLflow has no upper bound.
      body: { experiment_ids: [fixture.experiment.id], max_results: 5000 },
    });
    expect(loggedModels.status).toBe(200);
  });

  it('search_logged_modelsの続きのページの印は、次のページで件数を変えても使える', async () => {
    for (const name of ['first', 'second', 'third']) await fixture.readyModel({ name });
    async function searchLoggedModels(body: Record<string, unknown>) {
      return entity<{ models: { info: { name: string } }[]; next_page_token?: string }>(
        await request(fixture.app, `${fixture.modelEndpoint}/search`, {
          method: 'POST',
          cookie: fixture.viewer.cookie,
          body: { experiment_ids: [fixture.experiment.id], ...body },
        }),
        200,
      );
    }
    const first = await searchLoggedModels({ max_results: 2 });
    expect(first.models).toHaveLength(2);
    const rest = await searchLoggedModels({ max_results: 5, page_token: first.next_page_token });
    expect(rest.models).toHaveLength(1);
    expect(rest.next_page_token).toBeUndefined();
  });

  it('search_registered_modelsはライブラリが付ける tag.`mlflow.prompt.is_prompt` != \'true\' で普通のモデルを返す', async () => {
    await entity(
      await fixture.createRegistered('Classifier', [{ key: 'team', value: 'audio' }]),
      200,
    );
    await entity(await fixture.createRegistered('Regressor'), 200);
    async function modelNames(filter: string): Promise<string[]> {
      const page = await entity<ModelPage>(
        await searchModels({ filter, max_results: SDK_REGISTERED_MODEL_MAX_RESULTS }),
        200,
      );
      return page.registered_models.map((model) => model.name);
    }
    expect(await modelNames(SDK_PROMPT_EXCLUSION)).toEqual(['Classifier', 'Regressor']);
    expect(await modelNames(`name LIKE 'C%' AND ${SDK_PROMPT_EXCLUSION}`)).toEqual(['Classifier']);
    // MLflow reads a missing prompt tag as 'false'; this API has no prompts to ask for.
    expect(await modelNames("tags.`mlflow.prompt.is_prompt` = 'false'")).toEqual([
      'Classifier',
      'Regressor',
    ]);
    expect(await modelNames("tags.`mlflow.prompt.is_prompt` = 'true'")).toEqual([]);
  });

  it('登録モデルとバージョンの検索は tag. と tags.、attribute. と前置きなしを同じに扱い、metric. や param. は断る', async () => {
    await entity(
      await fixture.createRegistered('Classifier', [{ key: 'team', value: 'audio' }]),
      200,
    );
    await entity(await fixture.createRegistered('Regressor'), 200);
    for (const filter of ["tag.team = 'audio'", "tags.team = 'audio'", "tags.`team` = 'audio'"]) {
      const page = await entity<ModelPage>(await searchModels({ filter }), 200);
      expect(page.registered_models.map((model) => model.name), filter).toEqual(['Classifier']);
    }
    for (const filter of ["attribute.name = 'Regressor'", "name = 'Regressor'"]) {
      const page = await entity<ModelPage>(await searchModels({ filter }), 200);
      expect(page.registered_models.map((model) => model.name), filter).toEqual(['Regressor']);
    }
    const ready = await fixture.readyModel();
    await entity(
      await fixture.register(ready.model.info.model_id, {
        tags: [{ key: 'stage', value: 'production' }],
      }),
      200,
    );
    for (const filter of ["tag.stage = 'production'", "tags.stage = 'production'"])
      expect(await versionNumbers({ filter }), filter).toEqual(['1']);
    for (const filter of ['metric.accuracy > 0', "param.alpha = '1'", "run.name = 'Classifier'", "attributes.name = 'Classifier'"]) {
      expect((await searchModels({ filter })).status, filter).toBe(422);
      expect((await searchVersions({ filter })).status, filter).toBe(422);
    }
  });

  it('バージョンの検索は version_number を条件と並び替えに使え、MLflowと同じく引用符付きの整数も比べられる', async () => {
    await entity(await fixture.createRegistered('Classifier'), 200);
    await addVersionRows('Classifier', 3);
    const filter = "name = 'Classifier'";
    expect(await versionNumbers({ filter, order_by: 'version_number DESC' })).toEqual([
      '3',
      '2',
      '1',
    ]);
    expect(await versionNumbers({ filter, order_by: 'version_number ASC' })).toEqual([
      '1',
      '2',
      '3',
    ]);
    const greaterThanOne = await versionNumbers({ filter: 'version_number > 1' });
    expect(greaterThanOne.sort()).toEqual(['2', '3']);
    for (const numberFilter of ["version_number = '2'", 'version_number = 2', 'attribute.version_number = 2'])
      expect(await versionNumbers({ filter: numberFilter }), numberFilter).toEqual(['2']);
    for (const filter of ['version = 2', 'attributes.version_number = 2', "constructor = 'x'", "__proto__ = 'x'"])
      expect((await searchVersions({ filter })).status, filter).toBe(422);
    expect(await versionNumbers({ filter: 'creation_timestamp > 0' })).toHaveLength(3);
    expect((await searchVersions({ filter: "version_number = '2.5'" })).status).toBe(422);
    expect((await searchVersions({ filter: "version_number LIKE '2%'" })).status).toBe(422);
  });

  it('登録モデルは MLflow が勧める timestamp（最後の更新）で並べられる', async () => {
    await entity(await fixture.createRegistered('Older'), 200);
    await entity(await fixture.createRegistered('Newer'), 200);
    // Set the update times apart so that two requests in the same millisecond cannot tie.
    await harness.database.query(
      `UPDATE mlflow_registered_model_metadata mm SET updated_at=now()+interval '1 hour'
      FROM models m WHERE m.id=mm.model_id AND m.name='Older'`,
    );
    for (const [order, expected] of [
      ['timestamp DESC', ['Older', 'Newer']],
      ['timestamp ASC', ['Newer', 'Older']],
    ] as const) {
      const page = await entity<ModelPage>(await searchModels({ order_by: order }), 200);
      expect(page.registered_models.map((model) => model.name), order).toEqual(expected);
    }
  });

  it('get_metric_historyは50000点を超える件数の指定を断らず、50000点ずつ続きのページの印でたどれる', async () => {
    await harness.database.query(
      `INSERT INTO metrics(run_id,name,value,step,timestamp)
      SELECT $1,'loss',g,g,now() FROM generate_series(1,$2::int) g`,
      [fixture.run.id, METRIC_HISTORY_PAGE_SIZE + 1],
    );
    async function history(query: Record<string, string>) {
      return entity<{ metrics: { step: string }[]; next_page_token?: string }>(
        await request(
          fixture.app,
          `${fixture.base}/api/2.0/mlflow/metrics/get-history?${new URLSearchParams({
            run_id: fixture.run.id,
            metric_key: 'loss',
            ...query,
          })}`,
          { cookie: fixture.viewer.cookie },
        ),
        200,
      );
    }
    const first = await history({ max_results: '100000' });
    expect(first.metrics).toHaveLength(METRIC_HISTORY_PAGE_SIZE);
    const rest = await history({
      max_results: SDK_METRIC_HISTORY_MAX_RESULTS,
      page_token: first.next_page_token!,
    });
    expect(rest.metrics.map((point) => Number(point.step))).toEqual([
      METRIC_HISTORY_PAGE_SIZE + 1,
    ]);
    expect(rest.next_page_token).toBeUndefined();
  });

  it.skipIf(!existsSync(mlflowSdkPythonPath))(
    '公式ライブラリで登録モデル・バージョンを検索でき、mlflow.search_model_versionsは続きのページを自動でたどる',
    async () => {
      await entity(
        await fixture.createRegistered('Classifier', [{ key: 'team', value: 'audio' }]),
        200,
      );
      await entity(await fixture.createRegistered('Bulk'), 200);
      await addVersionRows('Bulk', MODEL_PAGE_SIZE + 1);
      const minted = await entity<{ token: string }>(
        await request(harness.app, '/api/tokens', {
          method: 'POST',
          cookie: fixture.administrator.cookie,
          body: {
            name: 'mlflow-sdk-search',
            projectId: fixture.project.id,
            scopes: ['read'],
          },
        }),
      );
      const server = serve({
        fetch: harness.app.fetch,
        hostname: '127.0.0.1',
        port: SDK_TEST_HTTP_PORT,
      });
      await new Promise<void>((resolve) => server.once('listening', () => resolve()));
      try {
        const { port } = server.address() as AddressInfo;
        const script = [
          'import json, mlflow',
          'from mlflow import MlflowClient',
          'client = MlflowClient()',
          'page = client.search_model_versions("name = \'Bulk\'")',
          'print(json.dumps({',
          '  "registered": [m.name for m in client.search_registered_models()],',
          '  "registeredByTag": [m.name for m in mlflow.search_registered_models(filter_string="tag.team = \'audio\'")],',
          '  "clientPage": len(page),',
          '  "clientHasNextPage": bool(page.token),',
          '  "followedPages": len(mlflow.search_model_versions(filter_string="name = \'Bulk\'")),',
          '  "newest": str(client.search_model_versions("name = \'Bulk\'", order_by=["version_number DESC"], max_results=1)[0].version),',
          '}))',
        ].join('\n');
        const result = await promisify(execFile)(mlflowSdkPythonPath, ['-c', script], {
          env: {
            ...process.env,
            MLFLOW_TRACKING_URI: `http://127.0.0.1:${port}${fixture.base}`,
            MLFLOW_TRACKING_TOKEN: minted.token,
            MLFLOW_HTTP_REQUEST_MAX_RETRIES: '0',
            MLFLOW_DISABLE_AGENT_HINT: '1',
          },
        });
        expect(JSON.parse(result.stdout.trim().split('\n').at(-1)!)).toEqual({
          registered: ['Bulk', 'Classifier'],
          registeredByTag: ['Classifier'],
          clientPage: MODEL_PAGE_SIZE,
          clientHasNextPage: true,
          followedPages: MODEL_PAGE_SIZE + 1,
          newest: String(MODEL_PAGE_SIZE + 1),
        });
      } finally {
        await new Promise((resolve) => server.close(resolve));
      }
    },
  );
});
