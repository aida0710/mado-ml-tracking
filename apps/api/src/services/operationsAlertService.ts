import type { OperationsAlert, OperationsAlertState } from '@mmt/contracts';
import type { Principal } from '../auth/principal.js';
import type { Database } from '../db/database.js';
import { listProjectAlerts, listVisibleAlerts } from '../repositories/operationsAlertRepository.js';
import { requireProject, requireScope } from './accessService.js';

/** OperationsMonitorが持つアラートを読む。Projectを開ける人は誰でもそのアラートを見られる。 */
export class OperationsAlertService {
  constructor(private readonly database: Database) {}

  async list(
    principal: Principal,
    projectId: string,
    filter: { state: OperationsAlertState; limit: number },
  ): Promise<OperationsAlert[]> {
    await requireProject(this.database, principal, { projectId, role: 'viewer', scope: 'read' });
    return listProjectAlerts(this.database, { projectId, ...filter });
  }

  /**
   * principalがメンバーであるすべてのProjectのアラート（GET /operations-alerts）。ほかのProjectで
   * 止まったworkerが、そのProjectを開く前に見えるようにする。全体管理者のsessionはすべてを見る。
   * 全体管理者のtokenはその人として動き、その人がメンバーであるProjectだけを見る。
   */
  async listVisible(
    principal: Principal,
    filter: { state: OperationsAlertState; limit: number },
  ): Promise<OperationsAlert[]> {
    requireScope(principal, 'read');
    return listVisibleAlerts(this.database, {
      userId: principal.user.id,
      seesEveryProject: principal.method === 'session' && principal.user.isAdmin,
      onlyProjectId: principal.token?.projectId ?? null,
      ...filter,
    });
  }
}
