import type { UserSearchResult } from '@mmt/contracts';
import type { Principal } from '../auth/principal.js';
import type { Database } from '../db/database.js';
import { DomainError } from '../domain/errors.js';
import {
  holdsAnyProjectAdminRole,
  listKnownGroupNames,
  searchActiveUsers,
} from '../repositories/identityRepository.js';
import { requireScope } from './accessService.js';

// 入力しながら選ぶには足りるが、adminが全ユーザーをページ送りで見られるほどではない候補数。
const USER_SEARCH_LIMIT = 20;

// Projectのアクセス設定で使う検索。roleを与えるユーザーと、既知のSSOグループ。
export class UserDirectoryService {
  constructor(private readonly database: Database) {}

  // Projectを作れる人（POST /projects）がここで最初のメンバーを選ぶので、同じ検査をかける。
  // Project限定のtokenはProjectを作れないうえ、そのProjectでのadminのroleも要る。
  async searchUsers(principal: Principal, query: string): Promise<UserSearchResult[]> {
    requireScope(principal, 'admin');
    if (principal.token?.projectId) await this.requireAccessAdministrator(principal);
    return searchActiveUsers(this.database, { query, limit: USER_SEARCH_LIMIT });
  }

  async listGroups(principal: Principal): Promise<string[]> {
    await this.requireAccessAdministrator(principal);
    return listKnownGroupNames(this.database);
  }

  // 全体管理者（requireGlobalAdminと同じ）と、いずれかのProjectのadmin。Project限定のtokenは、
  // そのProject自身のadminのroleだけを数える。
  private async requireAccessAdministrator(principal: Principal): Promise<void> {
    requireScope(principal, 'admin');
    if (principal.user.isAdmin && !principal.token?.projectId) return;
    const isProjectAdmin = await holdsAnyProjectAdminRole(this.database, {
      userId: principal.user.id,
      projectId: principal.token?.projectId ?? null,
    });
    if (!isProjectAdmin)
      throw new DomainError({
        status: 403,
        code: 'project_forbidden',
        message: 'project admin permission required',
      });
  }
}
