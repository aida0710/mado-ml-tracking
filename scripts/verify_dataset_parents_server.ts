import { serve } from '@hono/node-server';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { Dataset, DatasetVersion, Run } from '@mmt/contracts';
import { createHarness, entity, request } from '../apps/api/test/harness.js';
import { executionFixture, referenceDigest } from '../apps/api/test/fixtures.js';

const directory = path.resolve(
  process.env.MMT_VERIFICATION_DIR ?? 'artifacts/verification/2026-10-12/dataset-version-parents',
);
await mkdir(directory, { recursive: true });
const harness = await createHarness({
  environment: {
    MMT_WEB_ORIGIN: 'http://127.0.0.1:5984',
    MMT_ALLOW_PRIVATE_ORIGINS: 'true',
  },
});
try {
  const fixture = await executionFixture(harness);
  async function version(name: string, parents: string[] = []) {
    const dataset = await entity<Dataset>(
      await request(harness.app, `${fixture.basePath}/datasets`, {
        method: 'POST',
        cookie: fixture.editor.cookie,
        body: { name },
      }),
    );
    return entity<DatasetVersion>(
      await request(harness.app, `${fixture.basePath}/datasets/${dataset.id}/versions`, {
        method: 'POST',
        cookie: fixture.editor.cookie,
        body: {
          version: 'v1',
          uri: `s3://verification/${dataset.id}/manifest.json`,
          digest: referenceDigest(name),
          parentDatasetVersionIds: parents,
        },
      }),
    );
  }
  const audio = await version('つばき・加工音声32tar');
  const features = await version('つばき・未フィルタ特徴量');
  const style = await version('つばき・学習用特徴量', [features.id]);
  const runs: string[] = [];
  for (let index = 0; index < 12; index++) {
    const created = await entity<Run>(
      await request(harness.app, `${fixture.basePath}/runs`, {
        method: 'POST',
        cookie: fixture.editor.cookie,
        body: {
          name: `つばき・学習${index + 1}`,
          kind: 'training',
          experimentId: fixture.experiment.id,
          codeVersionId: fixture.codeVersion.id,
          inputDatasetVersionIds: [style.id],
        },
      }),
    );
    await entity(
      await request(harness.app, `${fixture.basePath}/runs/${created.id}`, {
        method: 'PATCH',
        cookie: fixture.editor.cookie,
        body: { status: 'finished' },
      }),
      200,
    );
    runs.push(created.id);
  }
  await entity(
    await request(
      harness.app,
      `${fixture.basePath}/models/${fixture.model.id}/versions/${fixture.modelVersion.id}/training-source`,
      {
        method: 'POST',
        cookie: fixture.editor.cookie,
        body: { runId: runs[0] },
      },
    ),
    200,
  );
  await writeFile(
    path.join(directory, 'browser-fixture.json'),
    JSON.stringify({
      projectId: fixture.project.id,
      modelId: fixture.model.id,
      modelVersionId: fixture.modelVersion.id,
      audio,
      features,
      style,
      runs,
    }),
  );
  const server = serve({ fetch: harness.app.fetch, hostname: '127.0.0.1', port: 47165 });
  console.log('isolated_dataset_parent_api=47165');
  let stopping = false;
  async function stop() {
    if (stopping) return;
    stopping = true;
    server.close();
    await harness.close();
    process.exit(0);
  }
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
} catch (error) {
  await harness.close();
  throw error;
}
