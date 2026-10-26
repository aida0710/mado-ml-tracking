import { jsonRequestInit, requestJson } from '@mado/design-system/http';
import type { AutomationRuleOwnerTransfer, CreateAutomationExecution } from '@mmt/contracts';
import {
  itemsOf,
  modelAutomationExecutionPageSchema,
  modelAutomationExecutionSchema,
  modelAutomationRuleSchema,
  ruleMetricKeysSchema,
} from '@mmt/contracts/schemas';
import type { CreateAutomationRule } from './inputs';
import { encodeId, projectPath } from './http';

// APIの最大値。バージョンの実行や、選択欄に出すルールの実行を、ポーリングの1ページで読み切る。
export const AUTOMATION_EXECUTION_PAGE_MAX = 200;
// APIの既定値。Projectの履歴はこの件数ずつ表示し、求められたら続きを読む。
export const AUTOMATION_HISTORY_PAGE_SIZE = 100;

/** どの実行を読むか（1つのルール、1つのバージョン、またはその両方）。続きはcursorで読む。 */
export interface AutomationExecutionFilter {
  ruleId?: string;
  modelVersionId?: string;
}

const rulesPath = (projectId: string) => `${projectPath(projectId)}/automation-rules`;
export const automationApi = {
  rules: async (projectId: string, signal?: AbortSignal) =>
    (await requestJson(rulesPath(projectId), { schema: itemsOf(modelAutomationRuleSchema), init: { signal } }))
      .items,
  createRule: (projectId: string, body: CreateAutomationRule) =>
    requestJson(rulesPath(projectId), { schema: modelAutomationRuleSchema, init: jsonRequestInit('POST', body) }),
  setRuleEnabled: (projectId: string, ruleId: string, enabled: boolean) =>
    requestJson(`${rulesPath(projectId)}/${encodeId(ruleId)}`, {
      schema: modelAutomationRuleSchema,
      init: jsonRequestInit('PATCH', { enabled }),
    }),
  // ルールのRun（まだ1つも無ければ、そのコードバージョンのRun）が記録したメトリクスのキー。
  ruleMetricKeys: (projectId: string, ruleId: string, signal?: AbortSignal) =>
    requestJson(`${rulesPath(projectId)}/${encodeId(ruleId)}/metric-keys`, {
      schema: ruleMetricKeysSchema,
      init: { signal },
    }),
  // 既存のバージョン（または上流のRun）にルールを手動で適用する。Project adminだけ。
  createExecution: (projectId: string, ruleId: string, body: CreateAutomationExecution) =>
    requestJson(`${rulesPath(projectId)}/${encodeId(ruleId)}/executions`, {
      schema: modelAutomationExecutionSchema,
      init: jsonRequestInit('POST', body),
    }),
  // ルールをProjectのService Accountとして動かす。Project adminだけ。
  transferOwner: (projectId: string, ruleId: string, body: AutomationRuleOwnerTransfer) =>
    requestJson(`${rulesPath(projectId)}/${encodeId(ruleId)}/owner`, {
      schema: modelAutomationRuleSchema,
      init: jsonRequestInit('PUT', body),
    }),
  // Projectの実行の1ページ（新しい順）。nextCursorで次の古いページを読む。
  executionPage: (
    projectId: string,
    {
      filter = {},
      limit,
      cursor,
    }: { filter?: AutomationExecutionFilter; limit: number; cursor?: string },
    signal?: AbortSignal,
  ) => {
    const query = new URLSearchParams({ limit: String(limit) });
    if (filter.ruleId) query.set('ruleId', filter.ruleId);
    if (filter.modelVersionId) query.set('modelVersionId', filter.modelVersionId);
    if (cursor) query.set('cursor', cursor);
    return requestJson(`${projectPath(projectId)}/automation-executions?${query}`, {
      schema: modelAutomationExecutionPageSchema,
      init: { signal },
    });
  },
};
