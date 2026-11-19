import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type { OperationsAlert, PluginConnection } from '@mmt/contracts';
import { migrate } from '../src/db/migrate.js';
import { createHarness, entity, request, testDatabaseUrl } from './harness.js';
import { projectFixture } from './fixtures.js';
import { applyMigrationsBefore } from './migrationFixtures.js';

/** 072までの版が保存していた接続の設定。 */
const CONFIG_WITH_LINEAGE = {
  apiUrl: 'https://mado-api.example.test',
  webUrl: 'https://mado.example.test',
  lineageUrl: 'https://mado-lineage.example.test',
  jobNamespace: 'mado-model-tracking',
  storageSystemKey: 'mado-model-tracking',
};
const LINEAGE_URL = `${CONFIG_WITH_LINEAGE.lineageUrl}/api/openlineage/v1/lineage`;

describe.skipIf(!testDatabaseUrl)('Data CatalogのDataLineage連携を外す移行（独立PostgreSQL）', () => {
  it('接続の設定と確認結果からDataLineageの項目を外し、取り込み済みのバージョンと送信の記録は残す', async () => {
    const harness = await createHarness({ applyMigrations: false });
    try {
      await applyMigrationsBefore(harness.database, '073_remove_data_catalog_lineage.sql');
      const fixture = await projectFixture(harness);
      const checked = randomUUID();
      const lineageOnly = randomUUID();
      const unchecked = randomUUID();
      await harness.database.query(
        `INSERT INTO plugin_connections(id,project_id,name,kind,config,config_revision,enabled,manifest,access_token_grant)
         VALUES ($1,$4,'Checked','mado',$5,3,true,$6,$7),
          ($2,$4,'Lineage only','mado',$5,2,true,$8,$9),
          ($3,$4,'Unchecked','mado',$5,1,false,NULL,NULL)`,
        [
          checked, lineageOnly, unchecked, fixture.project.id, CONFIG_WITH_LINEAGE,
          { id: 'mado', name: 'Mado', version: '1.0.0', protocolVersion: '1.0',
            capabilities: ['datasets:search', 'lineage:publish', 'storage:metrics'] },
          { name: 'ML Tracking', scopes: ['lineage:read', 'lineage:write', 'metrics:read'],
            namespaces: ['speech', 'mado-model-tracking'], expiresAt: null },
          { id: 'mado', name: 'Mado', version: '1.0.0', protocolVersion: '1.0',
            capabilities: ['datasets:search', 'lineage:publish'] },
          { name: 'Lineage', scopes: ['lineage:read', 'lineage:write'], namespaces: ['*'],
            expiresAt: '2027-01-01T00:00:00.000Z' },
        ],
      );
      const dataset = (await harness.database.query<{ id: string }>(
        "INSERT INTO datasets(project_id,name,namespace) VALUES($1,'Corpus','speech') RETURNING id",
        [fixture.project.id],
      )).rows[0]!;
      const versionId = randomUUID();
      const externalRef = {
        pluginId: checked, externalId: randomUUID(), namespace: 'speech', name: 'Corpus', version: 'v1',
      };
      const metadata = { madoDatasetId: randomUUID(), madoVersionId: externalRef.externalId };
      await harness.database.query(
        `INSERT INTO dataset_versions(id,dataset_id,project_id,version,uri,digest,metadata,external_ref)
         VALUES($1,$2,$3,'v1','s3://bucket/corpus','sha256:corpus',$4,$5)`,
        [versionId, dataset.id, fixture.project.id, metadata, externalRef],
      );
      const deliveredEvent = randomUUID();
      const pendingEvent = randomUUID();
      const sendingEvent = randomUUID();
      await harness.database.query(
        `INSERT INTO plugin_outbox(plugin_id,event_id,event,payload,payload_hash,destination_url,config_revision,
          status,attempts,delivery_id,locked_at,last_error,delivered_at)
         VALUES($1,$2,'{}','{}',$5,$6,3,'delivered',1,NULL,NULL,NULL,now()),
          ($1,$3,'{}','{}',$5,$6,3,'pending',5,NULL,NULL,'plugin_delivery_failed',NULL),
          ($1,$4,'{}','{}',$5,$6,3,'sending',1,gen_random_uuid(),now(),NULL,NULL)`,
        [checked, deliveredEvent, pendingEvent, sendingEvent, 'a'.repeat(64), LINEAGE_URL],
      );
      const outboxBefore = (await harness.database.query('SELECT * FROM plugin_outbox ORDER BY event_id')).rows;
      const openAlert = randomUUID();
      const closedAlert = randomUUID();
      const workerAlert = randomUUID();
      await harness.database.query(
        `INSERT INTO operations_alerts(id,project_id,kind,subject_id,resolved_at,resolution,detail)
         VALUES($1,$4,'plugin.delivery_stalled',$5,NULL,NULL,$7),
          ($2,$4,'plugin.delivery_stalled',$6,now(),'recovered',$7),
          ($3,$4,'worker.offline','token:worker',NULL,NULL,'{}')`,
        [openAlert, closedAlert, workerAlert, fixture.project.id, checked, lineageOnly,
          { pluginId: checked, pluginName: 'Checked', undelivered: 2, maxAttempts: 5 }],
      );

      await migrate(harness.database);

      const connections = await entity<{ items: PluginConnection[] }>(
        await request(harness.app, `${fixture.basePath}/plugins`, { cookie: fixture.administrator.cookie }),
        200,
      );
      const config = { apiUrl: CONFIG_WITH_LINEAGE.apiUrl, webUrl: CONFIG_WITH_LINEAGE.webUrl };
      const stored = (id: string) => connections.items.find((connection) => connection.id === id);
      expect(stored(checked)).toMatchObject({
        config, configRevision: 3, enabled: true,
        manifest: { capabilities: ['storage:metrics'] },
        accessTokenGrant: {
          name: 'ML Tracking', scopes: ['lineage:read', 'lineage:write', 'metrics:read'], expiresAt: null,
        },
      });
      expect(stored(lineageOnly)).toMatchObject({
        config, configRevision: 2, enabled: true,
        manifest: { capabilities: [] },
        accessTokenGrant: {
          name: 'Lineage', scopes: ['lineage:read', 'lineage:write'], expiresAt: '2027-01-01T00:00:00.000Z',
        },
      });
      expect(stored(unchecked)).toMatchObject({
        config, configRevision: 1, enabled: false, manifest: null, accessTokenGrant: null,
      });
      for (const connection of connections.items) {
        expect(Object.keys(connection.config).sort()).toEqual(['apiUrl', 'webUrl']);
        if (connection.accessTokenGrant)
          expect(Object.keys(connection.accessTokenGrant).sort()).toEqual(['expiresAt', 'name', 'scopes']);
      }

      expect((await harness.database.query(
        'SELECT uri,digest,metadata,external_ref FROM dataset_versions WHERE id=$1', [versionId],
      )).rows[0]).toEqual({
        uri: 's3://bucket/corpus', digest: 'sha256:corpus', metadata, external_ref: externalRef,
      });
      expect((await harness.database.query('SELECT * FROM plugin_outbox ORDER BY event_id')).rows)
        .toEqual(outboxBefore);

      const alerts = await entity<{ items: OperationsAlert[] }>(
        await request(harness.app, `${fixture.basePath}/operations-alerts?state=all`, {
          cookie: fixture.administrator.cookie,
        }),
        200,
      );
      const alert = (id: string) => alerts.items.find((candidate) => candidate.id === id);
      expect(alert(openAlert)).toMatchObject({ kind: 'plugin.delivery_stalled', resolution: 'inactive' });
      expect(alert(openAlert)!.resolvedAt).not.toBeNull();
      expect(alert(closedAlert)).toMatchObject({ kind: 'plugin.delivery_stalled', resolution: 'recovered' });
      expect(alert(workerAlert)).toMatchObject({ kind: 'worker.offline', resolvedAt: null, resolution: null });
    } finally {
      await harness.close();
    }
  });
});
