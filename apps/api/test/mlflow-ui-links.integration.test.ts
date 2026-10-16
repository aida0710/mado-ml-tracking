import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { promisify } from 'node:util';
import { serve } from '@hono/node-server';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { projectFixture } from './fixtures.js';
import { createHarness, entity, request, testDatabaseUrl, type Harness } from './harness.js';
import { mlflowSdkPythonPath } from './mlflow-sdk-fixtures.js';

// 0 lets the OS choose; set it to keep the SDK test on an allowed port range.
const SDK_TEST_HTTP_PORT = Number(process.env.MMT_TEST_HTTP_PORT ?? 0);

describe.skipIf(!testDatabaseUrl)('MLflowライブラリが出す画面のリンク', () => {
  let harness: Harness;
  let fixture: Awaited<ReturnType<typeof projectFixture>>;
  beforeAll(async () => {
    harness = await createHarness();
  });
  beforeEach(async () => {
    await harness.reset();
    fixture = await projectFixture(harness);
  });
  afterAll(async () => {
    await harness?.close();
  });

  it('トラッキング URI を開くと、末尾の / の有無にかかわらず Web の MLflow リンクの入口へ移る', async () => {
    const trackingUri = `/api/mlflow/projects/${fixture.project.id}`;
    for (const path of [`${trackingUri}/`, trackingUri]) {
      // A browser following a "View run" link sends no credentials the API could check yet.
      const response = await request(harness.app, path);
      expect(response.status, path).toBe(302);
      expect(response.headers.get('Location'), path).toBe(
        `/projects/${fixture.project.id}/mlflow-ui`,
      );
    }
  });

  it('Project の ID でないものは移さず、MLflow API の経路はこれまでどおり応える', async () => {
    expect((await request(harness.app, '/api/mlflow/projects/not-a-project/')).status).toBe(422);
    const search = await request(
      harness.app,
      `/api/mlflow/projects/${fixture.project.id}/api/2.0/mlflow/experiments/search`,
      { method: 'POST', cookie: fixture.viewer.cookie, body: {} },
    );
    expect(search.status).toBe(200);
  });

  it.skipIf(!existsSync(mlflowSdkPythonPath))(
    '公式ライブラリが Run の終わりに出す「View run」「View experiment」のリンクは Web の入口へ移る',
    async () => {
      const minted = await entity<{ token: string }>(
        await request(harness.app, '/api/tokens', {
          method: 'POST',
          cookie: fixture.administrator.cookie,
          body: {
            name: 'mlflow-sdk-links',
            projectId: fixture.project.id,
            scopes: ['read', 'runs:write'],
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
        const trackingUri = `http://127.0.0.1:${port}/api/mlflow/projects/${fixture.project.id}`;
        const script = [
          'import mlflow',
          `mlflow.set_experiment("${fixture.experiment.name}")`,
          'with mlflow.start_run(run_name="linked") as run:',
          '    pass',
          'print("RUN", run.info.experiment_id, run.info.run_id)',
        ].join('\n');
        const result = await promisify(execFile)(mlflowSdkPythonPath, ['-c', script], {
          env: {
            ...process.env,
            MLFLOW_TRACKING_URI: trackingUri,
            MLFLOW_TRACKING_TOKEN: minted.token,
            MLFLOW_HTTP_REQUEST_MAX_RETRIES: '0',
            MLFLOW_DISABLE_AGENT_HINT: '1',
          },
        });
        const [, experimentId, runId] = /^RUN (\S+) (\S+)$/m.exec(result.stdout)!;
        const runLink = /View run linked at: (\S+)/.exec(result.stdout)?.[1];
        const experimentLink = /View experiment at: (\S+)/.exec(result.stdout)?.[1];
        expect(runLink).toBe(`${trackingUri}/#/experiments/${experimentId}/runs/${runId}`);
        expect(experimentLink).toBe(`${trackingUri}/#/experiments/${experimentId}`);
        for (const link of [runLink!, experimentLink!]) {
          const opened = await fetch(link, { redirect: 'manual' });
          expect(opened.status, link).toBe(302);
          expect(opened.headers.get('Location'), link).toBe(
            `/projects/${fixture.project.id}/mlflow-ui`,
          );
        }
      } finally {
        await new Promise((resolve) => server.close(resolve));
      }
    },
  );
});
