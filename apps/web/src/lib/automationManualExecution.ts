import type {
  CreateAutomationExecution,
  ModelAutomationExecution,
  ModelAutomationRule,
} from '@mmt/contracts';
import type { ExecutionCatalog } from '../types/executionCatalog';
import type { SelectOption } from '../types/form';
import { buildCatalogOptions } from './catalogOptions';
import { formatDate } from './format';

type ManualRule = Pick<ModelAutomationRule, 'trigger' | 'upstreamRuleId' | 'modelFamilies'>;

/** ルールのモデル系列のバージョン。重みと互換性はAPIが確かめ直す。 */
export function manualVersionOptions(
  rule: ManualRule,
  registry: ExecutionCatalog,
): SelectOption[] {
  const familyVersionIds = new Set(
    registry.modelVersions
      .filter((version) => rule.modelFamilies.includes(version.family))
      .map((version) => version.id),
  );
  return buildCatalogOptions(registry).models.filter((option) =>
    familyVersionIds.has(option.value),
  );
}

/**
 * 上流のルールが作った、終了したRun。上流につないだルールを開始できるのはこれだけ。APIは上流の
 * 段を実行からたどり、Runのタグからは決してたどらないため。
 */
export function manualUpstreamRunOptions({
  rule,
  executions,
  versionLabel,
}: {
  rule: ManualRule;
  executions: ModelAutomationExecution[];
  versionLabel: (modelVersionId: string) => string;
}): SelectOption[] {
  const seenRunIds = new Set<string>();
  const options: SelectOption[] = [];
  for (const execution of executions) {
    const runId = execution.runId;
    if (execution.ruleId !== rule.upstreamRuleId || execution.runStatus !== 'finished' || !runId)
      continue;
    if (seenRunIds.has(runId)) continue;
    seenRunIds.add(runId);
    options.push({
      value: runId,
      label: `${versionLabel(execution.modelVersionId)} · ${formatDate(execution.createdAt)}`,
    });
  }
  return options;
}

export function manualExecutionRequest(
  rule: ManualRule,
  selectedId: string,
): CreateAutomationExecution {
  return rule.trigger === 'upstream_run_finished'
    ? { triggerRunId: selectedId }
    : { modelVersionId: selectedId };
}
