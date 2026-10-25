import type { AuditEventPage } from '@mmt/contracts';
import type { Principal } from '../auth/principal.js';
import type { Database } from '../db/database.js';
import {
  SIGN_IN_AUDIT_ACTIONS,
  type AuditEventQuery,
  type ProjectAuditEventQuery,
} from '../domain/auditValidation.js';
import { DomainError, notFound } from '../domain/errors.js';
import type { RequestMetadata } from '../http/requestMetadata.js';
import {
  auditCursorExists,
  listAuditEvents,
  writeAuditEvent,
  type AuditEventFilter,
  type AuditEventInput,
} from '../repositories/auditRepository.js';
import { requireGlobalAdmin, requireProject, requireScope } from './accessService.js';

// デモのseedのような内部の呼び出し元には、結び付けるHTTPリクエストが無い。
export const NO_REQUEST_METADATA: RequestMetadata = { ipAddress: null, userAgent: null };

// deniedとして記録するのは認可の拒否だけ。検証の失敗や存在しないリソースは記録しない。
export const DENIED_STATUSES: ReadonlySet<number> = new Set([403, 409]);

export type AuditEventDraft = Omit<AuditEventInput, 'outcome'>;

export function auditActor(
  principal: Principal,
): Pick<AuditEventInput, 'actorType' | 'actorUserId' | 'actorTokenId'> {
  // Job tokenはjob_tokensにあり、actorTokenIdはapi_tokensを参照する。
  // 自動で書いたことが分かるよう、呼び出し側がdetailsにJob IDを記録する。
  if (principal.token?.job)
    return { actorType: 'system', actorUserId: null, actorTokenId: null };
  return principal.token
    ? { actorType: 'token', actorUserId: principal.user.id, actorTokenId: principal.token.id }
    : { actorType: 'user', actorUserId: principal.user.id, actorTokenId: null };
}

/**
 * 操作を実行し、403・409の拒否をdeniedの監査イベントとして記録する。
 * deniedの行は操作のトランザクションの外でpoolを使って書く。拒否がここまで届いたときには、
 * そのトランザクションは既にロールバックしているため。
 */
export async function recordDenial<T>(
  database: Database,
  draft: AuditEventDraft,
  operation: () => Promise<T>,
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof DomainError && DENIED_STATUSES.has(error.status))
      await writeAuditEvent(database, {
        ...draft,
        outcome: 'denied',
        details: { ...draft.details, code: error.code },
      });
    throw error;
  }
}

export class AuditService {
  constructor(readonly database: Database) {}

  async list(principal: Principal, query: AuditEventQuery): Promise<AuditEventPage> {
    // 全体のログはすべてのProjectにまたがるので、tokenにはadminに加えて明示のaudit:readが要る。
    requireScope(principal, 'audit:read');
    requireGlobalAdmin(principal);
    return this.page(query);
  }

  async listForProject(
    principal: Principal,
    projectId: string,
    query: ProjectAuditEventQuery,
  ): Promise<AuditEventPage> {
    await requireProject(this.database, principal, { projectId, role: 'admin', scope: 'admin' });
    return this.page({ ...query, projectId });
  }

  private async page(query: AuditEventQuery): Promise<AuditEventPage> {
    const { hideSignIns, ...rest } = query;
    const filter: AuditEventFilter = {
      ...rest,
      excludedActions: hideSignIns ? SIGN_IN_AUDIT_ACTIONS : [],
    };
    const cursor = filter.cursor && { id: filter.cursor, projectId: filter.projectId };
    if (cursor && !(await auditCursorExists(this.database, cursor)))
      notFound('audit event cursor');
    // 件数のクエリを使わずに次のページの有無を知るため、1行多く取る。
    const events = await listAuditEvents(this.database, { ...filter, limit: filter.limit + 1 });
    const items = events.slice(0, filter.limit);
    return { items, nextCursor: events.length > filter.limit ? items.at(-1)!.id : null };
  }
}
