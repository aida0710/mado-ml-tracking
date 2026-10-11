import type { OperationsAlert, OperationsAlertState } from '@mmt/contracts';
import type { Principal } from '../auth/principal.js';
import type { Database } from '../db/database.js';
import { listProjectAlerts, listVisibleAlerts } from '../repositories/operationsAlertRepository.js';
import { requireProject, requireScope } from './accessService.js';

/** Reads the alerts OperationsMonitor keeps; everyone who may open a Project sees its alerts. */
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
   * Alerts of every Project the principal is a member of (GET /operations-alerts), so a stopped
   * worker elsewhere shows before that Project is opened. Global administrators' sessions see all;
   * their tokens act for the person and see only the Projects they are a member of.
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
