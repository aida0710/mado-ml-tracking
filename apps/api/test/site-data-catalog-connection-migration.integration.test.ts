import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { migrate } from '../src/db/migrate.js';
import { createHarness, testDatabaseUrl } from './harness.js';
import { projectFixture } from './fixtures.js';
import { applyMigrationsBefore } from './migrationFixtures.js';

describe.skipIf(!testDatabaseUrl)('接続を全体で1つにする移行（独立PostgreSQL）', () => {
  it('Projectごとの接続は行を残してアクセストークンと確認の結果を消し、全体の接続は未接続で始まる', async () => {
    const harness = await createHarness({ applyMigrations: false });
    try {
      await applyMigrationsBefore(harness.database, '074_site_data_catalog_connection.sql');
      const fixture = await projectFixture(harness);
      const enabled = randomUUID();
      const unconfigured = randomUUID();
      const config = { apiUrl: 'https://catalog.example.test', webUrl: 'https://catalog.example.test' };
      await harness.database.query(
        `INSERT INTO plugin_connections(id,project_id,name,kind,config,config_revision,enabled,
          secret_key_id,encrypted_credentials,credentials_configured,manifest,access_token_grant)
         VALUES ($1,$3,'Enabled','mado',$4,2,true,'test-key',$5,'{"accessToken":true}',$6,$7),
          ($2,$3,'Unconfigured','mado',$4,1,false,NULL,NULL,'{"accessToken":false}',NULL,NULL)`,
        [
          enabled, unconfigured, fixture.project.id, config, Buffer.from('ciphertext'),
          { id: 'mado', name: 'Mado', version: '1.0.0', protocolVersion: '1.0', capabilities: ['storage:metrics'] },
          { name: 'ML Tracking', scopes: ['metrics:read'], expiresAt: null },
        ],
      );
      const dataset = (await harness.database.query<{ id: string }>(
        "INSERT INTO datasets(project_id,name,namespace) VALUES($1,'Corpus','speech') RETURNING id",
        [fixture.project.id],
      )).rows[0]!;
      const externalRef = {
        pluginId: enabled, externalId: randomUUID(), namespace: 'speech', name: 'Corpus', version: 'v1',
      };
      await harness.database.query(
        `INSERT INTO dataset_versions(id,dataset_id,project_id,version,uri,digest,external_ref)
         VALUES($1,$2,$3,'v1','s3://bucket/corpus','sha256:corpus',$4)`,
        [randomUUID(), dataset.id, fixture.project.id, externalRef],
      );

      await migrate(harness.database);

      const connections = (await harness.database.query(
        `SELECT id,config,config_revision,enabled,secret_key_id,encrypted_credentials,
          credentials_configured,manifest,access_token_grant FROM plugin_connections ORDER BY name`,
      )).rows;
      const cleared = {
        config, enabled: false, secret_key_id: null, encrypted_credentials: null,
        credentials_configured: { accessToken: false }, manifest: null, access_token_grant: null,
      };
      expect(connections).toEqual([
        { id: enabled, config_revision: 2, ...cleared },
        { id: unconfigured, config_revision: 1, ...cleared },
      ]);
      expect((await harness.database.query('SELECT external_ref FROM dataset_versions')).rows)
        .toEqual([{ external_ref: externalRef }]);
      expect((await harness.database.query('SELECT * FROM data_catalog_connection')).rows).toEqual([]);
    } finally {
      await harness.close();
    }
  });
});
