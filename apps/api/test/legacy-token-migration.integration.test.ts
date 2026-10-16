import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { migrate } from '../src/db/migrate.js';
import { createHarness, testDatabaseUrl } from './harness.js';
import { projectFixture } from './fixtures.js';
import { applyMigrationsBefore } from './migrationFixtures.js';

const FIRST_PENDING = '068_revoke_legacy_tokens.sql';

describe.skipIf(!testDatabaseUrl)('旧形式のtokenの失効（独立PostgreSQL）', () => {
  it('人が所有するservice tokenと接頭辞の無いtokenを失効させ、理由を監査ログに残す', async () => {
    const harness = await createHarness({ applyMigrations: false });
    try {
      await applyMigrationsBefore(harness.database, FIRST_PENDING);
      const fixture = await projectFixture(harness);
      async function insertToken(token: {
        name: string;
        kind: 'personal' | 'service';
        prefix: string | null;
        revokedAt?: string;
      }): Promise<string> {
        const inserted = await harness.database.query<{ id: string }>(
          `INSERT INTO api_tokens(user_id,created_by_user_id,project_id,name,kind,token_hash,token_prefix,scopes,revoked_at)
          VALUES($1,$1,$2,$3,$4,$5,$6,'{read}',$7) RETURNING id`,
          [fixture.administrator.userId, fixture.project.id, token.name, token.kind, randomUUID(),
            token.prefix, token.revokedAt ?? null],
        );
        return inserted.rows[0]!.id;
      }
      const personOwnedService = await insertToken({ name: 'Old worker', kind: 'service', prefix: 'mmt_oldworkr' });
      const withoutPrefix = await insertToken({ name: 'Before prefixes', kind: 'personal', prefix: null });
      const current = await insertToken({ name: 'Current', kind: 'personal', prefix: 'mmt_current1' });
      const revokedBefore = '2026-10-01T00:00:00.000Z';
      const alreadyRevoked = await insertToken({
        name: 'Revoked before', kind: 'service', prefix: null, revokedAt: revokedBefore,
      });

      await migrate(harness.database);

      const tokens = await harness.database.query<{ id: string; revoked_at: Date | null }>(
        'SELECT id,revoked_at FROM api_tokens',
      );
      const revokedAt = new Map(tokens.rows.map((row) => [row.id, row.revoked_at]));
      expect(revokedAt.get(personOwnedService)).not.toBeNull();
      expect(revokedAt.get(withoutPrefix)).not.toBeNull();
      expect(revokedAt.get(current)).toBeNull();
      expect(revokedAt.get(alreadyRevoked)?.toISOString()).toBe(revokedBefore);

      const audit = await harness.database.query<{ resource_id: string; actor_type: string; reason: string }>(
        `SELECT resource_id,actor_type,details->>'reason' AS reason FROM audit_events
        WHERE action='token.revoke' ORDER BY resource_id`,
      );
      expect(audit.rows).toEqual(
        [
          { resource_id: personOwnedService, actor_type: 'system', reason: 'person_owned_service_token' },
          { resource_id: withoutPrefix, actor_type: 'system', reason: 'prefix_missing' },
        ].sort((left, right) => left.resource_id.localeCompare(right.resource_id)),
      );

      await expect(insertToken({ name: 'New without prefix', kind: 'personal', prefix: null }))
        .rejects.toThrow(/api_tokens_live_prefix/);
    } finally {
      await harness.close();
    }
  });
});
