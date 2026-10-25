import type { SiteJobShell, SiteJobShellSummary } from '@mmt/contracts';
import type { Principal } from '../auth/principal.js';
import { transaction, type Database } from '../db/database.js';
import { notFound } from '../domain/errors.js';
import type { RequestMetadata } from '../http/requestMetadata.js';
import { writeAuditEvent } from '../repositories/auditRepository.js';
import {
  findCurrentJobShell,
  findJobShell,
  insertJobShell,
  jobShellSha256,
  listJobShells,
} from '../repositories/siteJobShellRepository.js';
import { lockSiteSettings } from '../repositories/siteSettingsRepository.js';
import { requireScope } from './accessService.js';
import { auditActor, recordDenial, type AuditEventDraft } from './auditService.js';
import { findSiteTarget, requireTargetManager, requireTargetUser } from './siteAccess.js';

/**
 * siteのjob shell。変更できないバージョンとして残す。コンピュータを使える人は読める（手動の
 * siteでは本人としてそれを実行する）。次のバージョンを保存するのは所有者か全体管理者。
 */
export class SiteJobShellService {
  constructor(private readonly database: Database) {}

  async list(principal: Principal, targetId: string): Promise<SiteJobShellSummary[]> {
    requireScope(principal, 'read');
    const target = await findSiteTarget(this.database, targetId);
    await requireTargetUser(this.database, principal, target);
    return listJobShells(this.database, targetId);
  }

  async get(principal: Principal, reference: { targetId: string; shellId: string }): Promise<SiteJobShell> {
    requireScope(principal, 'read');
    const target = await findSiteTarget(this.database, reference.targetId);
    await requireTargetUser(this.database, principal, target);
    const shell = await findJobShell(this.database, { targetId: target.id, id: reference.shellId });
    if (!shell) notFound('site job shell');
    return shell;
  }

  /** 次のバージョンを作る。今のバージョンと同じ内容なら、今のものをそのまま返す。 */
  async create(
    principal: Principal,
    targetId: string,
    request: { content: string; metadata: RequestMetadata },
  ): Promise<{ shell: SiteJobShell; created: boolean }> {
    const draft: AuditEventDraft = {
      ...auditActor(principal),
      ...request.metadata,
      action: 'site.job_shell.create',
      resourceType: 'compute_target',
      resourceId: targetId,
      details: { sha256: jobShellSha256(request.content) },
    };
    return recordDenial(this.database, draft, () =>
      transaction(this.database, async (connection) => {
        const target = await findSiteTarget(connection, targetId, { lock: true });
        requireTargetManager(principal, target);
        await lockSiteSettings(connection, target.id);
        const current = await findCurrentJobShell(connection, target.id);
        if (current?.content === request.content) return { shell: current, created: false };
        const shell = await insertJobShell(connection, {
          targetId: target.id,
          content: request.content,
          createdBy: principal.user.id,
        });
        await writeAuditEvent(connection, {
          ...draft,
          outcome: 'success',
          details: { ...draft.details, version: shell.version, previousVersion: current?.version ?? null },
        });
        return { shell, created: true };
      }),
    );
  }
}
