import type {
  CreateAutomationExecution,
  ModelAutomationExecution,
  ModelAutomationRule,
} from '@mmt/contracts';
import { hasActiveExecution } from './automationActivity';
import { manualExecutionRequest } from './automationManualExecution';

type RerunExecution = Pick<
  ModelAutomationExecution,
  'status' | 'runStatus' | 'jobStatus' | 'modelVersionId' | 'triggerRunId'
>;
type RerunRule = Pick<
  ModelAutomationRule,
  'enabled' | 'trigger' | 'upstreamRuleId' | 'modelFamilies'
>;

/**
 * 行を手動でもう一度適用できるか。有効なルールの、保存済みで実行中でない実行であること。
 * 上流につないだルールには、開始元の上流のRunが要る。APIも確かめ直す。
 */
export function canRerunExecution(execution: RerunExecution, rule: RerunRule | undefined): boolean {
  if (!rule?.enabled || hasActiveExecution([execution])) return false;
  return rule.trigger === 'model_registered' || execution.triggerRunId !== null;
}

/** 同じルールを同じバージョン（または上流のRun）に対して実行する手動の適用。 */
export function rerunRequest(
  execution: RerunExecution,
  rule: RerunRule,
): CreateAutomationExecution {
  return manualExecutionRequest(
    rule,
    rule.trigger === 'upstream_run_finished' ? execution.triggerRunId! : execution.modelVersionId,
  );
}
