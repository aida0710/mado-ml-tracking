import { automationApi } from '../api/automation';
import { useQuery } from './useQuery';

/** The metric keys the evaluation rule's Runs recorded; nothing is loaded before a rule is chosen. */
export function useRuleMetricKeys(projectId: string, ruleId: string) {
  return useQuery(ruleId ? `${projectId}:rule-metric-keys:${ruleId}` : null, (signal) =>
    automationApi.ruleMetricKeys(projectId, ruleId, signal),
  );
}
