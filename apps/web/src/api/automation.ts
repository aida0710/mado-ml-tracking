import type {
  AutomationRuleOwnerTransfer,
  CreateAutomationExecution,
  ModelAutomationExecution,
  ModelAutomationExecutionPage,
  ModelAutomationRule,
  RuleMetricKeys,
} from '@mmt/contracts';
import type { CreateAutomationRule } from './inputs';
import {
  assertCursorPage,
  encodeId,
  jsonRequest,
  projectPath,
  request,
  requestItems,
} from './http';

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
  rules: (projectId: string, signal?: AbortSignal) =>
    requestItems<ModelAutomationRule>(rulesPath(projectId), signal),
  createRule: (projectId: string, body: CreateAutomationRule) =>
    request<ModelAutomationRule>(rulesPath(projectId), jsonRequest('POST', body)),
  setRuleEnabled: (projectId: string, ruleId: string, enabled: boolean) =>
    request<ModelAutomationRule>(
      `${rulesPath(projectId)}/${encodeId(ruleId)}`,
      jsonRequest('PATCH', { enabled }),
    ),
  // ルールのRun（まだ1つも無ければ、そのコードバージョンのRun）が記録したメトリクスのキー。
  ruleMetricKeys: (projectId: string, ruleId: string, signal?: AbortSignal) =>
    request<RuleMetricKeys>(`${rulesPath(projectId)}/${encodeId(ruleId)}/metric-keys`, { signal }),
  // 既存のバージョン（または上流のRun）にルールを手動で適用する。Project adminだけ。
  createExecution: (projectId: string, ruleId: string, body: CreateAutomationExecution) =>
    request<ModelAutomationExecution>(
      `${rulesPath(projectId)}/${encodeId(ruleId)}/executions`,
      jsonRequest('POST', body),
    ),
  // ルールをProjectのService Accountとして動かす。Project adminだけ。
  transferOwner: (projectId: string, ruleId: string, body: AutomationRuleOwnerTransfer) =>
    request<ModelAutomationRule>(
      `${rulesPath(projectId)}/${encodeId(ruleId)}/owner`,
      jsonRequest('PUT', body),
    ),
  // Projectの実行の1ページ（新しい順）。nextCursorで次の古いページを読む。
  executionPage: async (
    projectId: string,
    {
      filter = {},
      limit,
      cursor,
    }: { filter?: AutomationExecutionFilter; limit: number; cursor?: string },
    signal?: AbortSignal,
  ): Promise<ModelAutomationExecutionPage> => {
    const query = new URLSearchParams({ limit: String(limit) });
    if (filter.ruleId) query.set('ruleId', filter.ruleId);
    if (filter.modelVersionId) query.set('modelVersionId', filter.modelVersionId);
    if (cursor) query.set('cursor', cursor);
    const page = await request<ModelAutomationExecutionPage>(
      `${projectPath(projectId)}/automation-executions?${query}`,
      { signal },
    );
    assertCursorPage(page);
    return page;
  },
};
