import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { TokenSummary } from '@mmt/contracts';
import {
  createHarness,
  entity,
  errorCode,
  request,
  testDatabaseUrl,
  type Harness,
} from './harness.js';
import { projectFixture } from './fixtures.js';

type ProjectFixture = Awaited<ReturnType<typeof projectFixture>>;
type IssuedToken = { token: string; item: TokenSummary };

const DAY_MILLISECONDS = 24 * 60 * 60 * 1000;

describe.skipIf(!testDatabaseUrl)('tokenからのtoken管理と全体の操作（独立PostgreSQL）', () => {
  let harness: Harness;
  beforeAll(async () => {
    harness = await createHarness();
  });
  beforeEach(async () => {
    await harness.reset();
  });
  afterAll(async () => {
    await harness?.close();
  });

  function postToken(
    caller: { cookie?: string; token?: string },
    body: { name: string; projectId?: string; scopes: string[]; expiresAt?: string | null },
  ) {
    return request(harness.app, '/api/tokens', {
      method: 'POST',
      ...caller,
      body: { kind: 'personal', ...body },
    });
  }

  async function sessionToken(
    fixture: ProjectFixture,
    body: { name: string; projectId?: string; scopes: string[]; expiresAt?: string | null },
  ): Promise<IssuedToken> {
    return entity<IssuedToken>(await postToken({ cookie: fixture.administrator.cookie }, body));
  }

  function inDays(days: number): string {
    return new Date(Date.now() + days * DAY_MILLISECONDS).toISOString();
  }

  it('adminのtokenはtokens:manageを含まず、tokenを発行できない', async () => {
    const fixture = await projectFixture(harness);
    const admin = await sessionToken(fixture, {
      name: 'admin',
      projectId: fixture.project.id,
      scopes: ['admin'],
    });
    const response = await postToken(
      { token: admin.token },
      { name: 'nested', projectId: fixture.project.id, scopes: ['read'] },
    );
    expect(response.status).toBe(403);
    expect(await errorCode(response)).toBe('insufficient_scope');
  });

  it('tokens:manageのtokenは、自分のscope・Project・期限の範囲でだけtokenを発行できる', async () => {
    const fixture = await projectFixture(harness);
    const issuerExpiry = inDays(30);
    const issuer = await sessionToken(fixture, {
      name: 'issuer',
      projectId: fixture.project.id,
      scopes: ['read', 'tokens:manage'],
      expiresAt: issuerExpiry,
    });
    const child = await entity<IssuedToken>(
      await postToken(
        { token: issuer.token },
        { name: 'child', projectId: fixture.project.id, scopes: ['read'], expiresAt: inDays(7) },
      ),
    );
    expect(child.item).toMatchObject({ scopes: ['read'], ownerId: fixture.administrator.userId });
    expect((await request(harness.app, `${fixture.basePath}/runs`, { token: child.token })).status).toBe(200);

    const refusals: Array<[Parameters<typeof postToken>[1], string]> = [
      [{ name: 'stronger', projectId: fixture.project.id, scopes: ['runs:write'], expiresAt: inDays(7) }, 'scope_exceeds_issuer'],
      [{ name: 'unbound', scopes: ['read'], expiresAt: inDays(7) }, 'project_forbidden'],
      [{ name: 'forever', projectId: fixture.project.id, scopes: ['read'], expiresAt: null }, 'token_outlives_issuer'],
      // An omitted expiry takes the server default (365 days), which outlives the issuer.
      [{ name: 'default', projectId: fixture.project.id, scopes: ['read'] }, 'token_outlives_issuer'],
      [{ name: 'later', projectId: fixture.project.id, scopes: ['read'], expiresAt: inDays(31) }, 'token_outlives_issuer'],
    ];
    for (const [body, code] of refusals) {
      const response = await postToken({ token: issuer.token }, body);
      expect(response.status, body.name).toBe(403);
      expect(await errorCode(response), body.name).toBe(code);
    }
  });

  it('tokens:manageのtokenが失効できるのは、自分の範囲に収まるtokenだけ', async () => {
    const fixture = await projectFixture(harness);
    const issuer = await sessionToken(fixture, {
      name: 'issuer',
      projectId: fixture.project.id,
      scopes: ['read', 'tokens:manage'],
      expiresAt: inDays(30),
    });
    const weaker = await sessionToken(fixture, {
      name: 'weaker',
      projectId: fixture.project.id,
      scopes: ['read'],
      expiresAt: inDays(7),
    });
    const stronger = await sessionToken(fixture, {
      name: 'stronger',
      projectId: fixture.project.id,
      scopes: ['read', 'runs:write'],
      expiresAt: inDays(7),
    });
    const revoke = (target: IssuedToken) =>
      request(harness.app, `/api/tokens/${target.item.id}`, { method: 'DELETE', token: issuer.token });
    const refused = await revoke(stronger);
    expect(refused.status).toBe(403);
    expect(await errorCode(refused)).toBe('scope_exceeds_issuer');
    expect((await request(harness.app, `${fixture.basePath}/runs`, { token: stronger.token })).status).toBe(200);
    expect((await revoke(weaker)).status).toBe(204);
    expect((await request(harness.app, `${fixture.basePath}/runs`, { token: weaker.token })).status).toBe(401);
  });

  it('全体の監査ログは、Projectに縛られない全体管理者のtokenにaudit:readがあるときだけ読める', async () => {
    const fixture = await projectFixture(harness);
    const auditor = await sessionToken(fixture, { name: 'auditor', scopes: ['admin', 'audit:read'] });
    expect((await request(harness.app, '/api/audit-events', { token: auditor.token })).status).toBe(200);
    const adminOnly = await sessionToken(fixture, { name: 'admin only', scopes: ['admin'] });
    const withoutScope = await request(harness.app, '/api/audit-events', { token: adminOnly.token });
    expect(withoutScope.status).toBe(403);
    expect(await errorCode(withoutScope)).toBe('insufficient_scope');

    const bound = await postToken(
      { cookie: fixture.administrator.cookie },
      { name: 'bound auditor', projectId: fixture.project.id, scopes: ['admin', 'audit:read'] },
    );
    expect(bound.status).toBe(422);
    expect(await errorCode(bound)).toBe('global_scope_requires_unrestricted_token');
    const byResearcher = await postToken({ cookie: fixture.editor.cookie }, { name: 'researcher auditor', scopes: ['audit:read'] });
    expect(byResearcher.status).toBe(422);
    expect(await errorCode(byResearcher)).toBe('global_scope_requires_unrestricted_token');
  });

  it('ユーザー管理はusers:manageで読め、変更にはすべてのscopeを持つtokenが要る', async () => {
    const fixture = await projectFixture(harness);
    const reader = await sessionToken(fixture, { name: 'user reader', scopes: ['admin', 'users:manage'] });
    expect((await request(harness.app, '/api/admin/users', { token: reader.token })).status).toBe(200);
    const account = {
      username: 'created-by-token',
      displayName: 'Created by token',
      password: 'token-created-password',
      isAdmin: false,
    };
    const refused = await request(harness.app, '/api/admin/users', {
      method: 'POST',
      token: reader.token,
      body: account,
    });
    expect(refused.status).toBe(403);
    expect(await errorCode(refused)).toBe('insufficient_scope');

    const administrator = await sessionToken(fixture, {
      name: 'user administrator',
      scopes: ['admin', 'tokens:manage', 'audit:read', 'users:manage'],
    });
    const created = await request(harness.app, '/api/admin/users', {
      method: 'POST',
      token: administrator.token,
      body: account,
    });
    expect(created.status).toBe(201);
  });

  it('自分のpassword変更はtokenからはできない', async () => {
    const fixture = await projectFixture(harness);
    const administrator = await sessionToken(fixture, {
      name: 'everything',
      scopes: ['admin', 'tokens:manage', 'audit:read', 'users:manage'],
    });
    const response = await request(harness.app, '/api/auth/change-password', {
      method: 'POST',
      token: administrator.token,
      body: { currentPassword: 'unused-current-password', newPassword: 'unused-new-password' },
    });
    expect(response.status).toBe(403);
    expect(await errorCode(response)).toBe('session_required');
  });
});
