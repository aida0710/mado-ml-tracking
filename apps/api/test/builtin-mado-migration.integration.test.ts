import { createHash, randomUUID } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import type { Dataset, DatasetVersion, PluginAvailability, PluginConnection, PluginEvent } from '@mmt/contracts';
import { createApplication } from '../src/app.js';
import { migrate } from '../src/db/migrate.js';
import { createHarness, entity, request, testDatabaseUrl } from './harness.js';
import { executionFixture, referenceDigest } from './fixtures.js';
import { applyMigrationFile, applyMigrationsBefore } from './migrationFixtures.js';
import { MADO_CONFIG_FIXTURE, MADO_CREDENTIALS_FIXTURE, madoClientStub } from './pluginFixtures.js';

describe.skipIf(!testDatabaseUrl)('旧Mado接続と送信記録の移行（独立PostgreSQL）', () => {
  it('接続UUID・不変の外部参照・有効状態を保ち、照合済みの送信記録を引き継いでから再開する', async () => {
    const harness = await createHarness({ applyMigrations: false });
    try {
      await applyMigrationsBefore(harness.database, '059_builtin_mado.sql');
      // Current Run projections need these independent tables; Mado itself stays in its old shape.
      await applyMigrationFile(harness.database, '063_model_training_sources.sql');
      await applyMigrationFile(harness.database, '064_training_data_stages.sql');
      await applyMigrationFile(harness.database, '065_dataset_version_parent_additions.sql');
      const fixture = await executionFixture(harness);
      const pluginId = randomUUID();
      const unrelatedId = randomUUID();
      const manifest = { id: 'mado', name: 'Mado', version: '1.0.0', protocolVersion: '1.0', capabilities: ['datasets:search', 'lineage:publish'] };
      await harness.database.query(`INSERT INTO plugin_connections(id,project_id,name,base_url,token_env,manifest,enabled)
        VALUES($1,$2,'Old Mado','https://bridge.example.test','OLD_BRIDGE_TOKEN',$3::jsonb,true),
        ($4,$2,'Mado-looking connection','https://other-bridge.example.test','OLD_UNRELATED_TOKEN',NULL,true)`,
        [pluginId, fixture.project.id, JSON.stringify(manifest), unrelatedId]);
      const dataset = await entity<Dataset>(await request(harness.app, `${fixture.basePath}/datasets`, {
        method: 'POST', cookie: fixture.editor.cookie, body: { namespace: 'remote', name: 'Corpus' },
      }));
      const externalRef = { pluginId, externalId: randomUUID(), namespace: 'remote', name: 'Corpus', version: 'v1' };
      const version = await entity<DatasetVersion>(await request(harness.app, `${fixture.basePath}/datasets/${dataset.id}/versions`, {
        method: 'POST', cookie: fixture.editor.cookie,
        body: { version: 'v1', uri: 's3://fixture/corpus', digest: referenceDigest('legacy'), externalRef },
      }));
      const run = await fixture.newRun();
      const timestamp = '2026-10-12T00:00:00.000Z';
      const events: PluginEvent[] = ['run.started', 'run.finished'].map((type) => ({
        id: randomUUID(), type: type as PluginEvent['type'], timestamp, projectId: fixture.project.id,
        run, inputDatasets: [version], outputDatasets: [],
      }));
      for (const event of events)
        await harness.database.query('INSERT INTO plugin_outbox(plugin_id,event_id,event) VALUES($1,$2,$3::jsonb)',
          [pluginId, event.id, JSON.stringify(event)]);
      await harness.database.query("UPDATE plugin_outbox SET attempts=5,created_at=created_at-interval '16 minutes'");
      const originalRows = (await harness.database.query('SELECT id,event_id FROM plugin_outbox ORDER BY created_at')).rows;
      await migrate(harness.database);
      const sendPayload = vi.fn(async (_payload: string) => undefined);
      const application = createApplication({
        config: harness.config, database: harness.database, stores: harness.stores,
        pluginClientFactory: () => madoClientStub({ sendPayload }),
      });
      const endpoint = `${fixture.basePath}/plugins/${pluginId}`;
      const connections = await entity<{ items: PluginConnection[] }>(await request(application.app, `${fixture.basePath}/plugins`, {
        cookie: fixture.administrator.cookie,
      }), 200);
      expect(connections.items.find((connection) => connection.id === pluginId)).toMatchObject({
        kind: 'mado', enabled: true, configurationStatus: 'migration_pending', config: null,
        baseUrl: 'https://bridge.example.test', tokenEnv: 'OLD_BRIDGE_TOKEN', configRevision: 0,
      });
      expect(connections.items.find((connection) => connection.id === unrelatedId)).toMatchObject({ kind: 'legacy', configurationStatus: 'unsupported', enabled: true });
      expect(await application.outbox.dispatchBatch()).toBe(0);
      expect(await entity(await request(application.app, endpoint + '/outbox', {
        cookie: fixture.administrator.cookie,
      }), 200)).toMatchObject({ pending: 2, stalled: false });
      const configured = await entity<PluginConnection>(await request(application.app, endpoint, {
        method: 'PATCH', cookie: fixture.administrator.cookie,
        body: { config: MADO_CONFIG_FIXTURE, credentials: MADO_CREDENTIALS_FIXTURE, expectedRevision: 0 },
      }), 200);
      expect(configured).toMatchObject({ id: pluginId, enabled: true, configurationStatus: 'migration_pending', config: MADO_CONFIG_FIXTURE });
      expect(await application.outbox.dispatchBatch()).toBe(0);
      const availability = await entity<{ items: PluginAvailability[] }>(await request(application.app, `${fixture.basePath}/plugins/availability`, {
        cookie: fixture.administrator.cookie,
      }), 200);
      expect(availability.items[0]).toMatchObject({ id: pluginId, configured: false, canImport: false });
      const pinnedRows = (await harness.database.query('SELECT id,event_id,payload,payload_hash,destination_url,status FROM plugin_outbox ORDER BY created_at')).rows;
      expect(pinnedRows.map(({ id, event_id }) => ({ id, event_id }))).toEqual(originalRows);
      // The old bridge's published byte order is the ledger contract, including unchanged external identities.
      const oldBridgePayload = JSON.stringify({
        eventType: 'START', eventTime: timestamp,
        run: { runId: run.id, facets: { datasetRegistry: {
          runtime: { kind: run.kind, codeVersionId: run.codeVersionId },
          metrics: run.latestMetrics, modelRefs: [{ versionId: run.modelVersionId }],
        } } },
        job: { namespace: MADO_CONFIG_FIXTURE.jobNamespace, name: run.codeVersionId ?? run.name, facets: {} },
        inputs: [{ namespace: 'remote', name: 'Corpus', facets: { version: { datasetVersion: 'v1' } } }],
        outputs: [], producer: 'urn:mado-model-tracking:plugin:mado',
        schemaURL: 'https://openlineage.io/spec/2-0-2/OpenLineage.json',
      });
      expect(pinnedRows[0].payload).toBe(oldBridgePayload);
      expect(pinnedRows[0].payload_hash).toBe(createHash('sha256').update(oldBridgePayload).digest('hex'));
      expect(pinnedRows.every((row) => row.destination_url === MADO_CONFIG_FIXTURE.lineageUrl)).toBe(true);
      const complete = () => request(application.app, endpoint + '/migration/complete', {
        method: 'POST', cookie: fixture.administrator.cookie, body: { expectedRevision: configured.configRevision },
      });
      expect((await complete()).status).toBe(422);
      for (const [suffix, body] of [
        ['/events/retry', undefined], ['/datasets/search', { query: '' }],
        ['/datasets/import', { externalId: externalRef.externalId, expectedRevision: configured.configRevision }],
      ] as const)
        expect((await request(application.app, endpoint + suffix, {
          method: 'POST', cookie: fixture.administrator.cookie, body,
        })).status).toBe(422);
      const receipt = { eventId: events[0]!.id, payloadHash: pinnedRows[0].payload_hash };
      const importReceipts = (receipts: { eventId: string; payloadHash: string }[]) => request(application.app, endpoint + '/events/receipts', {
        method: 'POST', cookie: fixture.administrator.cookie, body: { receipts },
      });
      expect((await importReceipts([{ ...receipt, payloadHash: '0'.repeat(64) }])).status).toBe(409);
      expect((await importReceipts([receipt, { eventId: randomUUID(), payloadHash: receipt.payloadHash }])).status).toBe(404);
      expect((await harness.database.query('SELECT status FROM plugin_outbox WHERE event_id=$1', [receipt.eventId])).rows[0].status).toBe('pending');
      await harness.database.query("UPDATE plugin_outbox SET status='sending',delivery_id=$2,locked_at=now() WHERE event_id=$1", [receipt.eventId, randomUUID()]);
      expect((await importReceipts([receipt])).status).toBe(409);
      // An old process that died after publishing cannot clear its claim; its expired lease is safe to recover.
      await harness.database.query("UPDATE plugin_outbox SET locked_at=now()-interval '1 hour' WHERE event_id=$1", [receipt.eventId]);
      expect(await entity(await importReceipts([receipt]), 200)).toEqual({ imported: 1 });
      expect((await harness.database.query('SELECT status,delivery_id,locked_at FROM plugin_outbox WHERE event_id=$1', [receipt.eventId])).rows[0])
        .toEqual({ status: 'delivered', delivery_id: null, locked_at: null });
      expect(await entity(await importReceipts([receipt]), 200)).toEqual({ imported: 0 });
      await entity(await request(application.app, endpoint + '/check', {
        method: 'POST', cookie: fixture.administrator.cookie,
      }), 200);
      const migrated = await entity<PluginConnection>(await complete(), 200);
      expect(migrated).toMatchObject({ id: pluginId, enabled: true, configurationStatus: 'ready' });
      expect(migrated.configRevision).toBeGreaterThan(configured.configRevision);
      expect(await application.outbox.dispatchBatch()).toBe(1);
      expect(sendPayload).toHaveBeenCalledExactlyOnceWith(pinnedRows[1].payload);
      expect((await harness.database.query('SELECT id,event_id FROM plugin_outbox ORDER BY created_at')).rows).toEqual(originalRows);
      expect(await entity(await request(application.app, `${fixture.basePath}/datasets/${dataset.id}/versions`, {
        cookie: fixture.viewer.cookie,
      }), 200)).toEqual({ items: [version] });
      await expect(harness.database.query('UPDATE dataset_versions SET external_ref=$2::jsonb WHERE id=$1', [version.id, JSON.stringify({ ...externalRef, pluginId: unrelatedId })]))
        .rejects.toMatchObject({ code: '23514' });
      expect((await request(application.app, `${fixture.basePath}/plugins/${unrelatedId}`, {
        method: 'PATCH', cookie: fixture.administrator.cookie, body: { config: MADO_CONFIG_FIXTURE, expectedRevision: 0 },
      })).status).toBe(422);
      await entity(await request(application.app, `${fixture.basePath}/plugins/${unrelatedId}`, {
        method: 'PATCH', cookie: fixture.administrator.cookie, body: { enabled: false },
      }), 200);
    } finally {
      await harness.close();
    }
  });
});
