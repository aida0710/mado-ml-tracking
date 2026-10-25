import type { SitePersonalSettings, SitePersonalSettingsInput } from '@mmt/contracts';
import type { Principal } from '../auth/principal.js';
import { transaction, type Database } from '../db/database.js';
import { DomainError } from '../domain/errors.js';
import type { RequestMetadata } from '../http/requestMetadata.js';
import { writeAuditEvent } from '../repositories/auditRepository.js';
import { reconcileSiteKeys } from '../repositories/siteKeyRepository.js';
import {
  deletePersonalSettings,
  findPersonalSettings,
  listPersonalSettings,
  savePersonalSettings,
} from '../repositories/sitePersonalSettingsRepository.js';
import { findSiteSettings, lockSiteSettings } from '../repositories/siteSettingsRepository.js';
import { requireScope } from './accessService.js';
import { auditActor } from './auditService.js';
import { findSiteTarget, requireTargetManager, requireTargetUser } from './siteAccess.js';
import { requireSession } from './tokenService.js';

/**
 * 各人がsiteに設定するもの。アカウント、作業ディレクトリ、変数。launcherが依頼者ごとの
 * アカウントでログインするsiteでは、アカウント名を保存すると、launcherにその人の鍵を求める。
 */
export class SitePersonalSettingsService {
  constructor(private readonly database: Database) {}

  async listAll(principal: Principal, targetId: string): Promise<SitePersonalSettings[]> {
    requireScope(principal, 'read');
    const target = await findSiteTarget(this.database, targetId);
    requireTargetManager(principal, target);
    return listPersonalSettings(this.database, targetId);
  }

  async getOwn(principal: Principal, targetId: string): Promise<SitePersonalSettings | null> {
    requireScope(principal, 'read');
    const target = await findSiteTarget(this.database, targetId);
    await requireTargetUser(this.database, principal, target);
    return (await findPersonalSettings(this.database, { targetId, userId: principal.user.id })) ?? null;
  }

  async saveOwn(
    principal: Principal,
    targetId: string,
    request: { input: SitePersonalSettingsInput; metadata: RequestMetadata },
  ): Promise<SitePersonalSettings> {
    requireSession(principal, 'changing your own computer settings');
    return transaction(this.database, async (connection) => {
      const target = await findSiteTarget(connection, targetId, { lock: true });
      await requireTargetUser(connection, principal, target);
      await lockSiteSettings(connection, targetId);
      const site = (await findSiteSettings(connection, targetId))!;
      // 共有のアカウントの作業ディレクトリと変数は、その管理者だけが決める。
      if (target.submissionMode === 'automatic' && site.accountMode === 'shared')
        throw new DomainError({
          status: 422,
          code: 'site_settings_invalid',
          message: 'this computer runs with a shared account, so personal settings are not used',
        });
      const owner = { targetId, userId: principal.user.id };
      const previous = await findPersonalSettings(connection, owner);
      const settings = {
        ...owner,
        accountName: request.input.accountName ?? previous?.accountName ?? '',
        workDirectory:
          request.input.workDirectory !== undefined
            ? request.input.workDirectory || null
            : (previous?.workDirectory ?? null),
        variables: request.input.variables ?? previous?.variables ?? {},
      };
      if (target.submissionMode === 'automatic' && site.accountMode === 'personal' && !settings.accountName)
        throw new DomainError({
          status: 422,
          code: 'site_settings_invalid',
          message: 'this computer runs with personal accounts, so an account name is required',
        });
      await savePersonalSettings(connection, settings);
      await reconcileSiteKeys(connection, {
        targetId,
        automatic: target.submissionMode === 'automatic',
        settings: site,
      });
      await writeAuditEvent(connection, {
        ...auditActor(principal),
        ...request.metadata,
        action: 'site.personal_settings.update',
        outcome: 'success',
        resourceType: 'compute_target',
        resourceId: targetId,
        details: {
          accountName: settings.accountName,
          previousAccountName: previous?.accountName ?? null,
          variableNames: Object.keys(settings.variables),
        },
      });
      return (await findPersonalSettings(connection, owner))!;
    });
  }

  /** 自分の設定を消すと、そのsiteでの自分の鍵も失効させる。 */
  async deleteOwn(principal: Principal, targetId: string, metadata: RequestMetadata): Promise<void> {
    requireSession(principal, 'changing your own computer settings');
    await transaction(this.database, async (connection) => {
      const target = await findSiteTarget(connection, targetId, { lock: true });
      await requireTargetUser(connection, principal, target);
      await lockSiteSettings(connection, targetId);
      if (!(await deletePersonalSettings(connection, { targetId, userId: principal.user.id }))) return;
      const site = (await findSiteSettings(connection, targetId))!;
      await reconcileSiteKeys(connection, {
        targetId,
        automatic: target.submissionMode === 'automatic',
        settings: site,
      });
      await writeAuditEvent(connection, {
        ...auditActor(principal),
        ...metadata,
        action: 'site.personal_settings.delete',
        outcome: 'success',
        resourceType: 'compute_target',
        resourceId: targetId,
      });
    });
  }
}
