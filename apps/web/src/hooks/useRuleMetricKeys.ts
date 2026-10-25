import { automationApi } from '../api/automation';
import { useQuery } from './useQuery';

/** 評価ルールのRunが記録したメトリクスのキー。ルールを選ぶまでは何も読み込まない。 */
export function useRuleMetricKeys(projectId: string, ruleId: string) {
  return useQuery({ key: ruleId ? `${projectId}:rule-metric-keys:${ruleId}` : null, load: (signal) =>
    automationApi.ruleMetricKeys(projectId, ruleId, signal),
  });
}
