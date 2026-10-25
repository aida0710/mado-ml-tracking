import { operationsApi } from '../api/operations';
import { OPERATIONS_ALERT_POLL_MS } from './useOperationsAlerts';
import { useQuery } from './useQuery';

/**
 * Event delivery state of one plugin connection, refreshed as often as the alerts. pluginId null
 * skips the request, for viewers who may not read it.
 */
export function usePluginOutboxSummary(projectId: string, pluginId: string | null) {
  return useQuery({
    key: pluginId ? `plugin-outbox:${projectId}:${pluginId}` : null,
    load: (signal) => operationsApi.pluginOutbox(projectId, pluginId!, signal),
    pollMs: OPERATIONS_ALERT_POLL_MS,
  });
}
