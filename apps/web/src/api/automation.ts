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

// The API maximum: one polled page holds a version's executions, or a rule's for a selector.
export const AUTOMATION_EXECUTION_PAGE_MAX = 200;
// The API default: the Project history shows this many at a time and reads more on demand.
export const AUTOMATION_HISTORY_PAGE_SIZE = 100;

/** Which executions to read: one rule's, one version's, or both; the cursor continues a page. */
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
  // Metric keys the rule's Runs (or, before it has any, its code version's Runs) recorded.
  ruleMetricKeys: (projectId: string, ruleId: string, signal?: AbortSignal) =>
    request<RuleMetricKeys>(`${rulesPath(projectId)}/${encodeId(ruleId)}/metric-keys`, { signal }),
  // Applies a rule to an existing version (or upstream Run) by hand; Project admin only.
  createExecution: (projectId: string, ruleId: string, body: CreateAutomationExecution) =>
    request<ModelAutomationExecution>(
      `${rulesPath(projectId)}/${encodeId(ruleId)}/executions`,
      jsonRequest('POST', body),
    ),
  // Runs the rule as a Service Account of the Project; Project admin only.
  transferOwner: (projectId: string, ruleId: string, body: AutomationRuleOwnerTransfer) =>
    request<ModelAutomationRule>(
      `${rulesPath(projectId)}/${encodeId(ruleId)}/owner`,
      jsonRequest('PUT', body),
    ),
  // A page of the Project's executions, newest first; nextCursor reads the next older page.
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
