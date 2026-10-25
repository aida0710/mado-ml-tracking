import type { ServiceAccount } from '@mmt/contracts';
import type { z } from 'zod';
import type { Principal } from '../auth/principal.js';
import { transaction, type Connection, type Database } from '../db/database.js';
import { DomainError, notFound } from '../domain/errors.js';
import type {
  serviceAccountCreateSchema,
  serviceAccountTokenCreateSchema,
  serviceAccountUpdateSchema,
} from '../domain/serviceAccountValidation.js';
import { scopesBeyondRole } from '../domain/tokenScopes.js';
import type { RequestMetadata } from '../http/requestMetadata.js';
import { writeAuditEvent } from '../repositories/auditRepository.js';
import {
  findServiceAccount,
  insertServiceAccount,
  listServiceAccounts,
  lockServiceAccount,
  setServiceAccountRole,
  setServiceAccountStatus,
  updateServiceAccountDescription,
} from '../repositories/serviceAccountRepository.js';
import { requireProject } from './accessService.js';
import {
  auditActor,
  NO_REQUEST_METADATA,
  recordDenial,
  type AuditEventDraft,
} from './auditService.js';
import { issueApiToken, tokenCreateAuditDetails, type IssuedToken } from './tokenService.js';
import { requireGlobalScopesUnrestricted, requireGrantWithinIssuer } from './tokenIssuerAuthority.js';
import { resolveTokenExpiry } from '../domain/tokenExpiry.js';

interface ServiceAccountReference {
  projectId: string;
  serviceAccountId: string;
}

/**
 * Service Accounts of a Project and the tokens issued to them. Project admins manage them, in a
 * browser session or with a `tokens:manage` token; such a token issues only within its own grant.
 */
export class ServiceAccountService {
  private readonly database: Database;
  private readonly tokenDefaultLifetimeDays: number;

  constructor(dependencies: { database: Database; tokenDefaultLifetimeDays: number }) {
    this.database = dependencies.database;
    this.tokenDefaultLifetimeDays = dependencies.tokenDefaultLifetimeDays;
  }

  async list(principal: Principal, projectId: string): Promise<ServiceAccount[]> {
    await requireProjectAdmin(this.database, principal, projectId);
    return listServiceAccounts(this.database, projectId);
  }

  async create(
    principal: Principal,
    projectId: string,
    input: z.infer<typeof serviceAccountCreateSchema>,
    request: RequestMetadata = NO_REQUEST_METADATA,
  ): Promise<ServiceAccount> {
    const draft: AuditEventDraft = {
      ...auditActor(principal),
      ...request,
      action: 'service_account.create',
      resourceType: 'service_account',
      projectId,
      details: { name: input.name, role: input.role },
    };
    return recordDenial(this.database, draft, () =>
      transaction(this.database, async (connection) => {
        await requireProjectAdmin(connection, principal, projectId);
        const account = await insertServiceAccount(connection, {
          projectId,
          name: input.name,
          description: input.description,
          role: input.role,
          createdBy: principal.user.id,
        });
        await writeAuditEvent(connection, { ...draft, outcome: 'success', resourceId: account.id });
        return account;
      }),
    );
  }

  async update(
    principal: Principal,
    reference: ServiceAccountReference,
    input: z.infer<typeof serviceAccountUpdateSchema>,
    request: RequestMetadata = NO_REQUEST_METADATA,
  ): Promise<ServiceAccount> {
    const draft: AuditEventDraft = {
      ...auditActor(principal),
      ...request,
      action: 'service_account.update',
      resourceType: 'service_account',
      resourceId: reference.serviceAccountId,
      projectId: reference.projectId,
      details: { role: input.role ?? null, status: input.status ?? null },
    };
    return recordDenial(this.database, draft, () =>
      transaction(this.database, async (connection) => {
        await requireProjectAdmin(connection, principal, reference.projectId);
        const before = await lockServiceAccount(connection, reference);
        if (!before) notFound('service account');
        const { serviceAccountId, projectId } = reference;
        if (input.description !== undefined)
          await updateServiceAccountDescription(connection, {
            serviceAccountId,
            description: input.description,
          });
        if (input.role !== undefined)
          await setServiceAccountRole(connection, {
            projectId,
            serviceAccountId,
            role: input.role,
          });
        if (input.status !== undefined && input.status !== before.status)
          await setServiceAccountStatus(connection, { serviceAccountId, status: input.status });
        const after = (await findServiceAccount(connection, reference))!;
        await writeAuditEvent(connection, {
          ...draft,
          outcome: 'success',
          details: {
            previousRole: before.role,
            role: after.role,
            previousStatus: before.status,
            status: after.status,
            descriptionChanged: input.description !== undefined,
          },
        });
        return after;
      }),
    );
  }

  async createToken(
    principal: Principal,
    reference: ServiceAccountReference,
    input: z.infer<typeof serviceAccountTokenCreateSchema>,
    request: RequestMetadata = NO_REQUEST_METADATA,
  ): Promise<IssuedToken> {
    const draft: AuditEventDraft = {
      ...auditActor(principal),
      ...request,
      action: 'token.create',
      resourceType: 'api_token',
      projectId: reference.projectId,
      details: {
        name: input.name,
        kind: 'service',
        scopes: input.scopes,
        expiresAt: input.expiresAt ?? null,
        ownerType: 'service_account',
        ownerUserId: reference.serviceAccountId,
      },
    };
    return recordDenial(this.database, draft, () =>
      transaction(this.database, async (connection) => {
        await requireProjectAdmin(connection, principal, reference.projectId);
        requireGlobalScopesUnrestricted({
          scopes: input.scopes,
          projectId: reference.projectId,
          ownerIsAdmin: false,
        });
        const account = await lockServiceAccount(connection, reference);
        if (!account) notFound('service account');
        if (account.status !== 'active')
          throw new DomainError({
            status: 409,
            code: 'service_account_disabled',
            message: 'tokens cannot be issued for a disabled service account',
          });
        if (!account.role)
          throw new DomainError({
            status: 409,
            code: 'service_account_role_missing',
            message: 'the service account has no role in the project',
          });
        const excessScopes = scopesBeyondRole(input.scopes, account.role);
        if (excessScopes.length)
          throw new DomainError({
            status: 422,
            code: 'scope_exceeds_role',
            message: `scopes not allowed for the role of the service account (${account.role}): ${excessScopes.join(', ')}`,
            details: { role: account.role, scopes: excessScopes },
          });
        const expiresAt = resolveTokenExpiry({
          expiresAt: input.expiresAt,
          defaultLifetimeDays: this.tokenDefaultLifetimeDays,
          now: new Date(),
        });
        requireGrantWithinIssuer(principal, {
          scopes: input.scopes,
          projectId: reference.projectId,
          expiresAt: expiresAt?.toISOString() ?? null,
        });
        const issued = await issueApiToken(connection, {
          ownerUserId: account.id,
          createdByUserId: principal.user.id,
          projectId: reference.projectId,
          name: input.name,
          kind: 'service',
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
}

function requireProjectAdmin(
  connection: Connection,
  principal: Principal,
  projectId: string,
): Promise<unknown> {
  return requireProject(connection, principal, { projectId, role: 'admin', scope: 'tokens:manage' });
}
