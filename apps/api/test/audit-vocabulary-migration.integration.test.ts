import { describe, expect, it } from 'vitest';
import { migrate } from '../src/db/migrate.js';
import { createHarness, testDatabaseUrl } from './harness.js';
import { applyMigrationsBefore } from './migrationFixtures.js';

const FIRST_PENDING = '071_audit_failure_and_ip_address.sql';

describe.skipIf(!testDatabaseUrl)('監査ログの値をMadoの言葉へ移す（独立PostgreSQL）', () => {
  it('既存のfailedをfailureへ、ipをip_addressへ移し、追記だけの制約は保つ', async () => {
    const harness = await createHarness({ applyMigrations: false });
    try {
      await applyMigrationsBefore(harness.database, FIRST_PENDING);
      await harness.database.query(
        `INSERT INTO audit_events(actor_type,action,outcome,resource_type,ip) VALUES
          ('system','fixture.failed','failed','user','192.0.2.10'),
          ('system','fixture.denied','denied','user','192.0.2.11'),
          ('system','fixture.success','success','user',NULL)`,
      );

      await migrate(harness.database);

      const migrated = await harness.database.query<{ action: string; outcome: string; ip_address: string | null }>(
        "SELECT action,outcome,ip_address FROM audit_events WHERE action LIKE 'fixture.%' ORDER BY action",
      );
      expect(migrated.rows).toEqual([
        { action: 'fixture.denied', outcome: 'denied', ip_address: '192.0.2.11' },
        { action: 'fixture.failed', outcome: 'failure', ip_address: '192.0.2.10' },
        { action: 'fixture.success', outcome: 'success', ip_address: null },
      ]);
      await expect(
        harness.database.query(
          "INSERT INTO audit_events(actor_type,action,outcome,resource_type) VALUES('system','fixture.old','failed','user')",
        ),
      ).rejects.toMatchObject({ code: '23514' });
      await expect(
        harness.database.query("UPDATE audit_events SET outcome='success' WHERE action='fixture.failed'"),
      ).rejects.toMatchObject({ code: '23514' });
    } finally {
      await harness.close();
    }
  });
});
