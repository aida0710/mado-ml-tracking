import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { migrate } from '../src/db/migrate.js';
import { createHarness, testDatabaseUrl } from './harness.js';
import { executionFixture } from './fixtures.js';
import { applyMigrationsBefore } from './migrationFixtures.js';

describe.skipIf(!testDatabaseUrl)('現行データの制約への移行（独立PostgreSQL）', () => {
  it('所有者の無いコンピュータは作成監査の作成者を所有者にし、以後は所有者を必須にする', async () => {
    const harness = await createHarness({ applyMigrations: false });
    try {
      await applyMigrationsBefore(harness.database, '069_require_current_protocol.sql');
      const fixture = await executionFixture(harness);
      await harness.database.query('UPDATE compute_targets SET owner_user_id=NULL WHERE id=$1', [fixture.target.id]);
      await migrate(harness.database);
      expect((await harness.database.query('SELECT id,owner_user_id FROM compute_targets')).rows).toEqual([
        { id: fixture.target.id, owner_user_id: fixture.administrator.userId },
      ]);
      await expect(harness.database.query('UPDATE compute_targets SET owner_user_id=NULL WHERE id=$1', [fixture.target.id]))
        .rejects.toThrow();
    } finally { await harness.close(); }
  });

  it('所有者を決められないコンピュータや設定の欠けたsiteが残れば、移行を止めて何も変えない', async () => {
    const harness = await createHarness({ applyMigrations: false });
    try {
      await applyMigrationsBefore(harness.database, '069_require_current_protocol.sql');
      const fixture = await executionFixture(harness);
      const unknownId = randomUUID();
      const siteId = randomUUID();
      await harness.database.query(
        `INSERT INTO compute_targets(id,name,host,port,username,ssh_key_path,known_hosts_path,
          work_directory,python_executable,max_concurrent_jobs,executor,owner_user_id,runtime_kinds,dataset_transfer)
         VALUES($1,'Unknown','host',22,'user','/key','/known','/work','python3',1,'ssh',NULL,'{python}','relay'),
          ($2,'Missing settings','',22,'','','','', '',1,'site',$3,'{apptainer}','direct')`,
        [unknownId, siteId, fixture.administrator.userId],
      );
      await expect(migrate(harness.database))
        .rejects.toThrow(/1 computers without an owner, 1 sites with incomplete settings/);
      expect((await harness.database.query('SELECT count(*)::int AS count FROM compute_targets')).rows[0].count).toBe(3);
      expect((await harness.database.query(
        "SELECT count(*)::int AS count FROM schema_migrations WHERE name >= '069'",
      )).rows[0].count).toBe(0);
    } finally { await harness.close(); }
  });

  it('保存先と診断結果とheartbeatを確定し不足するworkerのleaseを失効させる', async () => {
    const harness = await createHarness({ applyMigrations: false });
    try {
      await applyMigrationsBefore(harness.database, '069_require_current_protocol.sql');
      const fixture = await executionFixture(harness);
      const run = await fixture.newRun();
      const token = (await harness.database.query('SELECT id FROM api_tokens WHERE token_hash IS NOT NULL LIMIT 1')).rows[0];
      await harness.database.query(
        `INSERT INTO storage_backends(name,kind,config,created_by) VALUES('stored','s3','{}',$1)`,
        [fixture.administrator.userId],
      );
      await harness.database.query("INSERT INTO demo_seed_history(name,project_id) VALUES('Mado Model Tracking Demo',$1)", [fixture.project.id]);
      const checkId = randomUUID();
      const result = { version: 1, items: [{ name: 'connection', status: 'ok', code: null, detail: null }], gpus: null, runtimeKinds: ['python'], workDirectoryFreeBytes: 10 };
      await harness.database.query(
        `INSERT INTO target_checks(id,target_id,requested_by,status,result,finished_at)
         VALUES($1,$2,$3,'finished',$4,now())`, [checkId, fixture.target.id, fixture.administrator.userId, result],
      );
      await harness.database.query(
        `INSERT INTO workers(project_id,token_id,worker_id) VALUES($1,$2,'incomplete')`, [fixture.project.id, token.id],
      );
      const jobId = randomUUID();
      await harness.database.query(
        `INSERT INTO jobs(id,project_id,run_id,target_id,status,worker_id,worker_token_id,lease_id,started_at)
         VALUES($1,$2,$3,$4,'running','incomplete',$5,$6,now()-interval '1 hour')`,
        [jobId, fixture.project.id, run.id, fixture.target.id, token.id, randomUUID()],
      );
      await migrate(harness.database);
      expect((await harness.database.query("SELECT config FROM storage_backends WHERE name='stored'")).rows[0].config).toEqual({ multipartEnabled: true });
      expect((await harness.database.query('SELECT result FROM target_checks WHERE id=$1', [checkId])).rows[0].result)
        .toMatchObject({ ...result, version: 2, host: { cpuCount: null }, pythons: [], directories: [] });
      expect((await harness.database.query('SELECT status,heartbeat_at=started_at AS observed FROM jobs WHERE id=$1', [jobId])).rows[0])
        .toEqual({ status: 'failed', observed: true });
      expect((await harness.database.query('SELECT * FROM workers')).rows).toEqual([]);
      expect((await harness.database.query('SELECT name FROM demo_seed_history')).rows).toEqual([{ name: 'mado ML Tracking Demo' }]);
      await expect(harness.database.query("UPDATE storage_backends SET config='{}' WHERE name='stored'")).rejects.toThrow();
      await expect(harness.database.query('UPDATE target_checks SET result=$2 WHERE id=$1', [checkId, result])).rejects.toThrow();
    } finally { await harness.close(); }
  });
});
