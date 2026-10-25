import {
  OPERATIONS_ALERT_MAX_PAGE_SIZE,
  type OperationsAlert,
  type PluginOutboxSummary,
} from '@mmt/contracts';
import { encodeId, projectPath, request, requestItems } from './http';

/** APIの運用監視が残したアラートと、pluginのイベントの送信状況。 */
export const operationsApi = {
  /**
   * 利用者がメンバーであるすべてのProject（全体管理者のsessionならすべて）の未解決のアラートを、
   * 新しい順に、1回の要求で取れる件数まで返す。各アラートは自分のProjectを示す。
   */
  openAlerts: (signal?: AbortSignal) =>
    requestItems<OperationsAlert>(
      `/operations-alerts?state=open&limit=${OPERATIONS_ALERT_MAX_PAGE_SIZE}`,
      signal,
    ),
  /** Project adminだけ。 */
  pluginOutbox: (projectId: string, pluginId: string, signal?: AbortSignal) =>
    request<PluginOutboxSummary>(`${projectPath(projectId)}/plugins/${encodeId(pluginId)}/outbox`, {
      signal,
    }),
};
