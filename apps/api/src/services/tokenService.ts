import type { TokenSummary } from '@mmt/contracts';
import type { z } from 'zod';
import type { Principal } from '../auth/principal.js';
import { createApiTokenSecret } from '../auth/apiTokens.js';
import { first, transaction, type Connection, type Database } from '../db/database.js';
import { DomainError, notFound } from '../domain/errors.js';
import { requiredProjectRoleForScopes } from '../domain/tokenScopes.js';
import { resolveTokenExpiry } from '../domain/tokenExpiry.js';
import type { tokenCreateSchema } from '../domain/validation.js';
import type { RequestMetadata } from '../http/requestMetadata.js';
import { writeAuditEvent } from '../repositories/auditRepository.js';
import {
  findActiveTokenOwnership,
  insertToken,
  listOwnedTokens,
  listProjectTokens,
  revokeToken,
  type TokenInsert,
} from '../repositories/apiTokenRepository.js';
import { requireProject, requireScope } from './accessService.js';
import { requireGlobalScopesUnrestricted, requireGrantWithinIssuer } from './tokenIssuerAuthority.js';
import {
  auditActor,
  NO_REQUEST_METADATA,
  recordDenial,
  type AuditEventDraft,
} from './auditService.js';

export interface IssuedToken {
  token: string;
  item: TokenSummary;
}

/** tokenの値を作り、そのハッシュと前置きだけを保存する。値は1回だけ返す。 */
export async function issueApiToken(
  connection: Connection,
  token: Omit<TokenInsert, 'tokenHash' | 'tokenPrefix'>,
): Promise<IssuedToken> {
  const secret = createApiTokenSecret();
  const item = await insertToken(connection, {
    ...token,
    tokenHash: secret.tokenHash,
    tokenPrefix: secret.tokenPrefix,
  });
  return { token: secret.token, item };
}

/** 発行したtokenの監査の詳細。値とそのハッシュは監査ログに入れない。 */
export function tokenCreateAuditDetails(item: TokenSummary) {
  return {
    name: item.name,
    kind: item.kind,
    scopes: item.scopes,
    expiresAt: item.expiresAt,
    ownerType: item.ownerType,
    ownerUserId: item.ownerId,
  };
}

export class TokenService {
  private readonly database: Database;
  private readonly tokenDefaultLifetimeDays: number;

  constructor(dependencies: { database: Database; tokenDefaultLifetimeDays: number }) {
    this.database = dependencies.database;
    this.tokenDefaultLifetimeDays = dependencies.tokenDefaultLifetimeDays;
  }

  async list(principal: Principal): Promise<TokenSummary[]> {
    requireScope(principal, 'read');
    return listOwnedTokens(this.database, {
      userId: principal.user.id,
      projectId: principal.token?.projectId ?? null,
    });
  }

  // 値は決して返さない。管理者は各tokenの所有者を見て、失効させられる。
  async listProject(principal: Principal, projectId: string): Promise<TokenSummary[]> {
    await requireProject(this.database, principal, { projectId, role: 'admin', scope: 'admin' });
    return listProjectTokens(this.database, projectId);
  }

  async create(
    principal: Principal,
    input: z.infer<typeof tokenCreateSchema>,
    request: RequestMetadata = NO_REQUEST_METADATA,
  ): Promise<IssuedToken> {
    const projectId = input.projectId ?? null;
    const kind = ownTokenKind(principal);
    const draft: AuditEventDraft = {
      ...auditActor(principal),
      ...request,
      action: 'token.create',
      resourceType: 'api_token',
      projectId,
      details: {
        name: input.name,
        kind,
        scopes: input.scopes,
        expiresAt: input.expiresAt ?? null,
        ownerType: 'user',
        ownerUserId: principal.user.id,
      },
    };
    return recordDenial(this.database, draft, () =>
      transaction(this.database, async (connection) => {
        await this.requireCreatePermission(connection, principal, input);
        const expiresAt = resolveTokenExpiry({
          expiresAt: input.expiresAt,
          defaultLifetimeDays: this.tokenDefaultLifetimeDays,
          now: new Date(),
        });
        requireGrantWithinIssuer(principal, {
          scopes: input.scopes,
          projectId,
          expiresAt: expiresAt?.toISOString() ?? null,
        });
        const issued = await issueApiToken(connection, {
          ownerUserId: principal.user.id,
          createdByUserId: principal.user.id,
          projectId,
          name: input.name,
          kind,
          scopes: input.scopes,
          expiresAt,
        });
        await writeAuditEvent(connection, {
          ...draft,
          outcome: 'success',
          resourceId: issued.item.id,
          details: tokenCreateAuditDetails(issued.item),
        });
        return issued;
      }),
    );
  }

  async revoke(
    principal: Principal,
    tokenId: string,
    request: RequestMetadata = NO_REQUEST_METADATA,
  ): Promise<void> {
    const draft: AuditEventDraft = {
      ...auditActor(principal),
      ...request,
      action: 'token.revoke',
      resourceType: 'api_token',
      resourceId: tokenId,
    };
    await recordDenial(this.database, draft, async () => requireScope(principal, 'tokens:manage'));
    const target = await findActiveTokenOwnership(this.database, tokenId);
    if (!target) notFound('token');
    const ownerType = target.ownerKind === 'service' ? 'service_account' : 'user';
    // tokenのProjectの下に記録し、そのProjectの管理者が拒まれた失効も見られるようにする。
    const projectDraft: AuditEventDraft = {
      ...draft,
      projectId: target.projectId,
      details: { ownerType, ownerUserId: target.ownerUserId },
    };
    await recordDenial(this.database, projectDraft, () =>
      transaction(this.database, async (connection) => {
        if (target.ownerUserId !== principal.user.id) {
          if (!target.projectId)
            throw new DomainError({
              status: 403,
              code: 'token_forbidden',
              message: 'tokens of other users cannot be changed',
            });
          await requireProject(connection, principal, {
            projectId: target.projectId,
            role: 'admin',
            scope: 'tokens:manage',
          });
        }
        requireGrantWithinIssuer(principal, target);
        const revoked = await revokeToken(connection, tokenId);
        // 並行した失効が先に済んだ。知らないtokenと同じように報告する。
        if (!revoked) notFound('token');
        await writeAuditEvent(connection, {
          ...projectDraft,
          outcome: 'success',
          details: { ...projectDraft.details, ...revoked },
        });
      }),
    );
  }

  private async requireCreatePermission(
    connection: Connection,
    principal: Principal,
    input: z.infer<typeof tokenCreateSchema>,
  ): Promise<void> {
    // tokenは自分に許された範囲の中でだけ発行できる（有効期限が決まってから
    // requireGrantWithinIssuerで確かめる）。
    requireScope(principal, 'tokens:manage');
    const projectId = input.projectId ?? null;
    requireGlobalScopesUnrestricted({ scopes: input.scopes, projectId, ownerIsAdmin: principal.user.isAdmin });
    if (input.scopes.includes('worker:execute') && !projectId)
      throw new DomainError({
        status: 422,
        code: 'project_required',
        message: 'a worker token requires a project',
      });
    if (!projectId) {
      if (input.scopes.some((scope) => scope !== 'read') && !principal.user.isAdmin)
        throw new DomainError({
          status: 403,
          code: 'project_required',
          message: 'specify a project for a write token',
        });
      return;
    }
    await requireProject(connection, principal, {
      projectId,
      role: requiredProjectRoleForScopes(input.scopes),
      scope: 'tokens:manage',
    });
    // sessionでの管理と違い、tokenではmembership（直接かグループを通したもの）が必須。
    const membership = await first(
      connection,
      'SELECT role FROM effective_project_roles WHERE project_id=$1 AND user_id=$2',
      [projectId, principal.user.id],
    );
    if (!membership)
      throw new DomainError({
        status: 403,
        code: 'membership_required',
        message: 'the owner of the token must be a member of the project',
      });
  }
}

/** 自分のために発行するtokenは自分の種類に合わせる。人ならpersonal、Service Accountならservice。 */
function ownTokenKind(principal: Principal): TokenSummary['kind'] {
  return principal.user.kind === 'service' ? 'service' : 'personal';
}

export function requireSession(principal: Principal, operation: string): void {
  if (principal.method !== 'session')
    throw new DomainError({
      status: 403,
      code: 'session_required',
      message: `${operation} requires signing in with a browser`,
    });
}
