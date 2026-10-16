/** Connect the built-in Mado client and real host/outbox to Mado's HTTP routes with an isolated Registry fixture. */
import assert from 'node:assert/strict';
import { startMadoVerificationServer } from './fixtures/madoVerificationServer.js';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createApplication } from '../apps/api/src/app.js';
import { referenceDigest } from '../apps/api/test/fixtures.js';
import { createHarness, entity, login, request } from '../apps/api/test/harness.js';
import type {
  Dataset,
  DatasetVersion,
  Experiment,
  PluginConnection,
  PluginDataset,
  Project,
  Run,
} from '@mmt/contracts';

const madoServer = await startMadoVerificationServer();
const { events, accessToken, versionId } = madoServer;
const harness = await createHarness();
const host = createApplication({
  config: harness.config,
  database: harness.database,
  stores: harness.stores,
});
try {
  const administrator = await login(harness);
  const project = await entity<Project>(
    await request(host.app, '/api/projects', {
      method: 'POST',
      cookie: administrator.cookie,
      body: { name: 'Mado integration fixture' },
    }),
  );
  const basePath = `/api/projects/${project.id}`;
  const plugin = await entity<PluginConnection>(
    await request(host.app, `${basePath}/plugins`, {
      method: 'POST',
      cookie: administrator.cookie,
      body: {
        kind: 'mado',
        name: 'Mado',
        config: {
          apiUrl: madoServer.url,
          webUrl: madoServer.url,
          lineageUrl: madoServer.url,
          jobNamespace: 'mado-model-tracking',
          storageSystemKey: 'mado-model-tracking',
        },
        credentials: { accessToken },
      },
    }),
  );
  const checked = await entity<PluginConnection>(
    await request(host.app, `${basePath}/plugins/${plugin.id}/check`, {
      method: 'POST',
      cookie: administrator.cookie,
    }),
    200,
  );
  assert(checked.manifest?.capabilities.includes('storage:metrics'));
  // Mado reported the namespaces itself; nobody typed them into the connection.
  assert.deepEqual(checked.accessTokenGrant?.namespaces, ['speech', 'mado-model-tracking', 'local']);
  assert.equal(checked.accessTokenGrant?.name, 'ML Tracking verification');
  assert.equal(plugin.enabled, false);
  assert.equal(events.length, 0, 'A disabled connection check must never send a Run');
  const enabledPlugin = await entity<PluginConnection>(
    await request(host.app, `${basePath}/plugins/${plugin.id}`, {
      method: 'PATCH',
      cookie: administrator.cookie,
      body: { enabled: true, expectedRevision: plugin.configRevision },
    }),
    200,
  );
  const metrics = await entity<{ prometheus: string }>(
    await request(host.app, `${basePath}/plugins/${plugin.id}/metrics`, {
      cookie: administrator.cookie,
    }),
    200,
  );
  assert(metrics.prometheus.includes('mado_storage_bucket_bytes'));
  assert(metrics.prometheus.includes('1048576'));
  const found = await entity<{ items: PluginDataset[] }>(
    await request(host.app, `${basePath}/plugins/${plugin.id}/datasets/search`, {
      method: 'POST',
      cookie: administrator.cookie,
      body: { query: 'corpus' },
    }),
    200,
  );
  assert.equal(found.items[0]?.externalId, versionId);
  assert(!JSON.stringify(found).includes('private-fixture'));
  const imported = await entity<DatasetVersion>(
    await request(host.app, `${basePath}/plugins/${plugin.id}/datasets/import`, {
      method: 'POST',
      cookie: administrator.cookie,
      body: { externalId: versionId, expectedRevision: enabledPlugin.configRevision },
    }),
  );
  assert.equal(imported.externalRef?.externalId, versionId);
  const experiment = await entity<Experiment>(
    await request(host.app, `${basePath}/experiments`, {
      method: 'POST',
      cookie: administrator.cookie,
      body: { name: 'Plugin flow' },
    }),
  );
  const run = await entity<Run>(
    await request(host.app, `${basePath}/runs`, {
      method: 'POST',
      cookie: administrator.cookie,
      body: {
        experimentId: experiment.id,
        name: 'Mado dataset processing',
        kind: 'processing',
        inputDatasetVersionIds: [imported.id],
      },
    }),
  );
  for (const status of ['running', 'finished'])
    await entity(
      await request(host.app, `${basePath}/runs/${run.id}`, {
        method: 'PATCH',
        cookie: administrator.cookie,
        body: { status },
      }),
      200,
    );
  assert.equal(await host.outbox.dispatchBatch(), 2);
  assert.deepEqual(
    events.map((event) => event.eventType),
    ['START', 'COMPLETE'],
  );
  assert.equal(events[1]?.inputs[0]?.namespace, 'speech');
  assert.equal(events[1]?.inputs[0]?.name, 'fixture-corpus');
  const outputDataset = await entity<Dataset>(
    await request(host.app, `${basePath}/datasets`, {
      method: 'POST',
      cookie: administrator.cookie,
      body: { name: 'predictions', namespace: 'local' },
    }),
  );
  await entity<DatasetVersion>(
    await request(host.app, `${basePath}/datasets/${outputDataset.id}/versions`, {
      method: 'POST',
      cookie: administrator.cookie,
      body: {
        version: 'v1',
        uri: '/mnt/predictions/v1',
        digest: referenceDigest('fixture-output'),
        sourceRunId: run.id,
      },
    }),
  );
  assert.equal(await host.outbox.dispatchBatch(), 1);
  assert.equal(events[2]?.eventType, 'COMPLETE');
  assert.equal(events[2]?.outputs[0]?.namespace, 'mado-model-tracking');
  assert.equal(events[2]?.outputs[0]?.name, `${project.id}/local/predictions`);
  assert.equal(events[2]?.inputs[0]?.namespace, 'speech');
  assert(!JSON.stringify(events[2]?.outputs[0]?.facets).includes('storageLocations'));
  assert(JSON.stringify(events[2]?.outputs[0]?.facets).includes(referenceDigest('fixture-output')));
  const stored = await harness.database.query('SELECT status FROM plugin_outbox');
  assert(stored.rows.every((row) => row.status === 'delivered'));
  const summary = {
    checks: [
      "one access token; namespaces read from Mado's /api/mado/access-token, none entered",
      'Mado namespace-scoped catalog and immutable version read',
      'built-in Mado search and server-resolved immutable import',
      'Mado metrics:read through built-in client and host API',
      'host Run transaction and durable pinned payload/destination',
      'real Mado OpenLineage profile/scope validation',
      'START/COMPLETE delivered with original input identity',
      'late output registration refreshes COMPLETE with a Project-scoped dataset identity',
      'native local paths preserve completion and content identity without fabricating a storage URI',
    ],
    registry: 'isolated fixture; production Registry was not contacted',
  };
  const verificationDate = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
  const artifactDirectory = path.resolve(`artifacts/verification/${verificationDate}`);
  await mkdir(artifactDirectory, { recursive: true });
  await writeFile(
    path.join(artifactDirectory, 'mado-plugin-integration.json'),
    JSON.stringify(summary, null, 2),
  );
  console.log(JSON.stringify(summary, null, 2));
} finally {
  await host.outbox.stop();
  await harness.close();
  await madoServer.close();
}
