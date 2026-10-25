import { createHash, randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { migrate } from '../src/db/migrate.js';
import { createHarness, entity, errorCode, request, testDatabaseUrl } from './harness.js';
import { projectFixture } from './fixtures.js';
import { applyMigrationsBefore } from './migrationFixtures.js';

const FIRST_PENDING = '072_token_prefix.sql';

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

describe.skipIf(!testDatabaseUrl)('tokenの前置きの変更（独立PostgreSQL）', () => {
  it('使える旧形式のtokenをすべて失効させて監査ログに理由を残し、以後は前置きの形を強制する', async () => {
    const harness = await createHarness({ applyMigrations: false });
    try {
      await applyMigrationsBefore(harness.database, FIRST_PENDING);
      const fixture = await projectFixture(harness);
      const serviceAccount = await entity<{ id: string }>(
        await request(harness.app, `/api/projects/${fixture.project.id}/service-accounts`, {
          method: 'POST',
          cookie: fixture.administrator.cookie,
          body: { name: 'Nightly evaluation', role: 'viewer' },
        }),
      );
      async function insertToken(token: {
        userId: string;
        prefix: string;
        revokedAt?: string;
      }): Promise<string> {
        const inserted = await harness.database.query<{ id: string }>(
          `INSERT INTO api_tokens(user_id,created_by_user_id,project_id,name,kind,token_hash,token_prefix,scopes,revoked_at)
          VALUES($1,$2,$3,'test','personal',$4,$5,'{read}',$6) RETURNING id`,
          [token.userId, fixture.administrator.userId, fixture.project.id, sha256(randomUUID()),
            token.prefix, token.revokedAt ?? null],
        );
        return inserted.rows[0]!.id;
      }
      const personal = await insertToken({ userId: fixture.editor.userId, prefix: 'mmt_personal' });
      const service = await insertToken({ userId: serviceAccount.id, prefix: 'mmt_serviceA' });
      const revokedBefore = '2026-10-01T00:00:00.000Z';
      const alreadyRevoked = await insertToken({
        userId: fixture.editor.userId, prefix: 'mmt_revoked1', revokedAt: revokedBefore,
      });

      await migrate(harness.database);

      const tokens = await harness.database.query<{ id: string; revoked_at: Date | null }>(
        'SELECT id,revoked_at FROM api_tokens',
      );
      const revokedAt = new Map(tokens.rows.map((row) => [row.id, row.revoked_at]));
      expect(revokedAt.get(personal)).not.toBeNull();
      expect(revokedAt.get(service)).not.toBeNull();
      expect(revokedAt.get(alreadyRevoked)?.toISOString()).toBe(revokedBefore);

      const audit = await harness.database.query<{ resource_id: string; reason: string; owner_type: string }>(
        `SELECT resource_id,details->>'reason' AS reason,details->>'ownerType' AS owner_type
        FROM audit_events WHERE action='token.revoke' AND actor_type='system' ORDER BY resource_id`,
      );
      expect(audit.rows).toEqual(
        [
          { resource_id: personal, reason: 'token_prefix_changed', owner_type: 'user' },
          { resource_id: service, reason: 'token_prefix_changed', owner_type: 'service_account' },
        ].sort((left, right) => left.resource_id.localeCompare(right.resource_id)),
      );

      await expect(insertToken({ userId: fixture.editor.userId, prefix: 'mmt_newtoken' }))
        .rejects.toThrow(/api_tokens_token_prefix_format/);
      await expect(insertToken({ userId: fixture.editor.userId, prefix: 'mado_mt_abcdefgh' }))
        .resolves.toEqual(expect.any(String));
    } finally {
      await harness.close();
    }
  });

  it('前置きの無い値と旧形式の値は、DBを引かずに401 invalid_tokenで断る', async () => {
    const harness = await createHarness();
    try {
      for (const token of ['mmt_0123456789abcdefghijklmnopqrstuvwxyzABCDEFG', 'mmtj_0123456789abcdef', 'plain-secret']) {
        const response = await request(harness.app, '/api/auth/me', { token });
        expect(response.status).toBe(401);
        expect(await errorCode(response)).toBe('invalid_token');
      }
    } finally {
      await harness.close();
    }
  });
});
