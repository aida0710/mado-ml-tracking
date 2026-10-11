import {
  OPERATIONS_ALERT_MAX_PAGE_SIZE,
  type OperationsAlert,
  type PluginOutboxSummary,
} from '@mmt/contracts';
import { encodeId, projectPath, request, requestItems } from './http';

/** Alerts kept by the API's operations monitor, and a plugin's event delivery state. */
export const operationsApi = {
  /**
   * Unresolved alerts of every Project the user is a member of (all of them for a global
   * administrator's session), newest first, as many as one request returns. Each names its Project.
   */
  openAlerts: (signal?: AbortSignal) =>
    requestItems<OperationsAlert>(
      `/operations-alerts?state=open&limit=${OPERATIONS_ALERT_MAX_PAGE_SIZE}`,
      signal,
    ),
  /** Project admin only. */
  pluginOutbox: (projectId: string, pluginId: string, signal?: AbortSignal) =>
    request<PluginOutboxSummary>(`${projectPath(projectId)}/plugins/${encodeId(pluginId)}/outbox`, {
      signal,
    }),
};
