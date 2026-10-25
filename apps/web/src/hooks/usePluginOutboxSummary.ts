import { operationsApi } from '../api/operations';
import { OPERATIONS_ALERT_POLL_MS } from './useOperationsAlerts';
import { useQuery } from './useQuery';

/**
 * 1つのプラグイン接続のイベントの送信状況。アラートと同じ間隔で更新する。pluginIdがnullなら
 * 要求を送らない。読む権限の無い利用者のため。
 */
export function usePluginOutboxSummary(projectId: string, pluginId: string | null) {
  return useQuery({
    key: pluginId ? `plugin-outbox:${projectId}:${pluginId}` : null,
    load: (signal) => operationsApi.pluginOutbox(projectId, pluginId!, signal),
    pollMs: OPERATIONS_ALERT_POLL_MS,
  });
}
