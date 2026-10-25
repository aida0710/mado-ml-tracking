import type { SiteConnectionCheck } from '@mmt/contracts';
import type { Principal } from '../auth/principal.js';
import { transaction, type Database } from '../db/database.js';
import { DomainError } from '../domain/errors.js';
import {
  expireStaleConnectionChecks,
  insertConnectionCheck,
  listConnectionChecks,
} from '../repositories/siteConnectionCheckRepository.js';
import { findLiveSiteKey } from '../repositories/siteKeyRepository.js';
import { requireScope } from './accessService.js';
import { findSiteTarget } from './siteAccess.js';
import { siteKeyAccount } from './siteKeyService.js';

/**
 * launcherがアカウントの鍵で一度ログインして`true`を実行する。これでアカウントの持ち主は、Jobを
 * 投入する前に、公開鍵が受け入れられたことを確かめられる。
 */
export class SiteConnectionCheckService {
  constructor(private readonly database: Database) {}

  async request(
    principal: Principal,
    targetId: string,
    request: { personal: boolean },
  ): Promise<SiteConnectionCheck> {
    return transaction(this.database, async (connection) => {
      const target = await findSiteTarget(connection, targetId);
      const account = await siteKeyAccount(connection, principal, { target, personal: request.personal });
      const key = await findLiveSiteKey(connection, { targetId, userId: account.userId });
      if (key?.status !== 'ready')
        throw new DomainError({
          status: 422,
          code: 'site_check_unavailable',
          message: 'the launcher has not created the key yet; check that the launcher is running',
        });
      await expireStaleConnectionChecks(connection);
      const check = await insertConnectionCheck(connection, {
        targetId,
        userId: account.userId,
        requestedBy: principal.user.id,
      });
      if (!check)
        throw new DomainError({
          status: 409,
          code: 'site_check_in_progress',
          message: 'a connection check of this account is already running',
        });
      return check;
    });
  }

  async list(
    principal: Principal,
    targetId: string,
    query: { personal: boolean },
  ): Promise<SiteConnectionCheck[]> {
    requireScope(principal, 'read');
    return transaction(this.database, async (connection) => {
      const target = await findSiteTarget(connection, targetId);
      const account = await siteKeyAccount(connection, principal, { target, personal: query.personal });
      await expireStaleConnectionChecks(connection);
      return listConnectionChecks(connection, { targetId, userId: account.userId });
    });
  }
}
