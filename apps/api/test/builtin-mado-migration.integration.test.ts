import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { migrate } from '../src/db/migrate.js';
import { createHarness, request, testDatabaseUrl } from './harness.js';
import { projectFixture } from './fixtures.js';
import { applyMigrationsBefore } from './migrationFixtures.js';
import { MADO_CONFIG_FIXTURE } from './pluginFixtures.js';

describe.skipIf(!testDatabaseUrl)('Madoの現行形式への移行（独立PostgreSQL）', () => {
  it('接続先が不明の行と未固定イベントを削除し067の未使用暗号文を消去する', async () => {
    const harness = await createHarness({ applyMigrations: false });
    try {
      await applyMigrationsBefore(harness.database, '069_require_current_protocol.sql');
      const fixture = await projectFixture(harness);
      const oldPlugin = randomUUID();
      const pendingPlugin = randomUUID();
      const unconfigured = randomUUID();
      const configured = randomUUID();
      await harness.database.query(
        `INSERT INTO plugin_connections(id,project_id,name,kind,config,migration_pending,
          encrypted_credentials,secret_key_id,credentials_configured)
         VALUES ($1,$5,'Bridge','legacy',NULL,false,NULL,NULL,'{"accessToken":false}'),
          ($2,$5,'Pending','mado',NULL,true,NULL,NULL,'{"accessToken":false}'),
          ($3,$5,'Unconfigured','mado',$6,false,$7,'test-key','{"accessToken":false}'),
          ($4,$5,'Current','mado',$6,false,$8,'test-key','{"accessToken":true}')`,
        [oldPlugin, pendingPlugin, unconfigured, configured, fixture.project.id,
          MADO_CONFIG_FIXTURE, Buffer.from('discarded-ciphertext'), Buffer.from('current-ciphertext')],
      );
      const dataset = (await harness.database.query<{ id: string }>(
        "INSERT INTO datasets(project_id,name,namespace) VALUES($1,'Corpus','test') RETURNING id", [fixture.project.id],
      )).rows[0]!;
      const versionId = randomUUID();
      await harness.database.query(
        `INSERT INTO dataset_versions(id,dataset_id,project_id,version,uri,digest,external_ref)
         VALUES($1,$2,$3,'1','s3://bucket/data','sha256:data',$4)`,
        [versionId, dataset.id, fixture.project.id, { pluginId: oldPlugin, externalId: 'corpus' }],
      );
      const eventId = randomUUID();
      await harness.database.query(
        `INSERT INTO plugin_outbox(plugin_id,event_id,event,payload,payload_hash,destination_url,config_revision)
         VALUES($1,$2,'{}','{}',$3,'https://mado.example.test/lineage',1),
          ($1,$4,'{}',NULL,NULL,NULL,NULL),($5,$6,'{}',NULL,NULL,NULL,NULL)`,
        [configured, eventId, 'a'.repeat(64), randomUUID(), oldPlugin, randomUUID()],
      );
      await migrate(harness.database);
      const connections = await harness.database.query('SELECT id,encrypted_credentials,secret_key_id FROM plugin_connections ORDER BY name');
      expect(connections.rows).toEqual([
        { id: configured, encrypted_credentials: Buffer.from('current-ciphertext'), secret_key_id: 'test-key' },
        { id: unconfigured, encrypted_credentials: null, secret_key_id: null },
      ]);
      expect((await harness.database.query('SELECT event_id FROM plugin_outbox')).rows).toEqual([{ event_id: eventId }]);
      expect((await harness.database.query('SELECT uri,digest,external_ref FROM dataset_versions WHERE id=$1', [versionId])).rows[0])
        .toEqual({ uri: 's3://bucket/data', digest: 'sha256:data', external_ref: null });
      await expect(harness.database.query('UPDATE plugin_outbox SET payload=NULL WHERE event_id=$1', [eventId])).rejects.toThrow();
      await expect(harness.database.query("UPDATE plugin_connections SET kind='legacy' WHERE id=$1", [configured])).rejects.toThrow();
      await expect(harness.database.query('UPDATE plugin_connections SET config=NULL WHERE id=$1', [configured])).rejects.toThrow();
      await expect(harness.database.query('UPDATE dataset_versions SET digest=$2 WHERE id=$1', [versionId, 'changed'])).rejects.toThrow();
      for (const suffix of ['migration/complete', 'events/receipts'])
        expect((await request(harness.app, `${fixture.basePath}/plugins/${configured}/${suffix}`, {
          method: 'POST', cookie: fixture.administrator.cookie, body: {},
        })).status).toBe(404);
    } finally {
      await harness.close();
    }
  });
});
