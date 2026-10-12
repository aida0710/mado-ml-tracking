import { serve } from '@hono/node-server';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { Dataset, DatasetVersion, Run, RunCheckpoint } from '@mmt/contracts';
import { createHarness, entity, request } from '../apps/api/test/harness.js';
import { executionFixture, referenceDigest } from '../apps/api/test/fixtures.js';

const verificationDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo' }).format(
  new Date(),
);
const directory = path.resolve(
  process.env.MMT_VERIFICATION_DIR ??
    `artifacts/verification/${verificationDate}/model-training-sources`,
);
await mkdir(directory, { recursive: true });
const harness = await createHarness({
  environment: { MMT_WEB_ORIGIN: 'http://127.0.0.1:5982', MMT_ALLOW_PRIVATE_ORIGINS: 'true' },
});
try {
  const fixture = await executionFixture(harness);
  const versions: DatasetVersion[] = [];
  for (const name of ['事前学習の元データ', '追加する合成データ']) {
    const dataset = await entity<Dataset>(
      await request(harness.app, `${fixture.basePath}/datasets`, {
        method: 'POST',
        cookie: fixture.editor.cookie,
        body: { name },
      }),
    );
    versions.push(
      await entity<DatasetVersion>(
        await request(harness.app, `${fixture.basePath}/datasets/${dataset.id}/versions`, {
          method: 'POST',
          cookie: fixture.editor.cookie,
          body: {
            version: 'v1',
            uri: `s3://verification-data/${dataset.id}/manifest.json`,
            digest: referenceDigest(name),
          },
        }),
      ),
    );
  }
  const run = await entity<Run>(
    await request(harness.app, `${fixture.basePath}/runs`, {
      method: 'POST',
      cookie: fixture.editor.cookie,
      body: {
        name: '事前学習・第1段階',
        kind: 'training',
        experimentId: fixture.experiment.id,
        codeVersionId: fixture.codeVersion.id,
        inputDatasetVersionIds: [versions[0]!.id],
      },
    }),
  );
  const archive = spawnSync('python3', [
    '-c',
    `import tarfile,io,sys
content=b'{"weight":1.5}'
with tarfile.open(fileobj=sys.stdout.buffer,mode='w|') as archive:
 header=tarfile.TarInfo('model.json');header.size=len(content);archive.addfile(header,io.BytesIO(content))`,
  ]);
  if (archive.status !== 0) throw new Error('Verification archive creation failed');
  const artifact = await entity<{ id: string }>(
    await request(
      harness.app,
      `${fixture.basePath}/runs/${run.id}/artifacts?path=checkpoints/step-1000.tar`,
      {
        method: 'PUT',
        cookie: fixture.editor.cookie,
        binary: new Uint8Array(archive.stdout),
        headers: { 'Content-Type': 'application/x-tar' },
      },
    ),
  );
  const checkpoint = await entity<RunCheckpoint>(
    await request(harness.app, `${fixture.basePath}/runs/${run.id}/checkpoints`, {
      method: 'POST',
      cookie: fixture.editor.cookie,
      body: {
        step: 1000,
        artifactId: artifact.id,
        manifest: {
          files: [
            {
              path: 'model.json',
              size: 14,
              sha256: createHash('sha256').update('{"weight":1.5}').digest('hex'),
            },
          ],
        },
      },
    }),
  );
  await entity(
    await request(harness.app, `${fixture.basePath}/runs/${run.id}`, {
      method: 'PATCH',
      cookie: fixture.editor.cookie,
      body: { status: 'finished' },
    }),
    200,
  );
  const activeRun = await entity<Run>(
    await request(harness.app, `${fixture.basePath}/runs`, {
      method: 'POST',
      cookie: fixture.editor.cookie,
      body: {
        name: '継続中の事前学習',
        kind: 'training',
        experimentId: fixture.experiment.id,
        codeVersionId: fixture.codeVersion.id,
        inputDatasetVersionIds: [versions[0]!.id],
      },
    }),
  );
  await writeFile(
    path.join(directory, 'browser-fixture.json'),
    JSON.stringify({
      projectId: fixture.project.id,
      modelId: fixture.model.id,
      versionId: fixture.modelVersion.id,
      experimentId: fixture.experiment.id,
      targetId: fixture.target.id,
      sourceRunId: run.id,
      activeRunId: activeRun.id,
      checkpointId: checkpoint.id,
      datasetIds: versions.map((version) => version.id),
    }),
  );
  const server = serve({ fetch: harness.app.fetch, hostname: '127.0.0.1', port: 47163 });
  console.log('isolated_training_api=47163');
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
