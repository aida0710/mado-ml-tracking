import type { ModelAutomationExecution } from '@mmt/contracts';

// 前の段階が成功せず、自動実行が始まらなかったときにAPIが記録するエラーコード。前の段階は、
// バージョンの元になった学習のRunか、上流につないだルールの上流の段。
const AUTOMATION_SKIP_REASONS = [
  'source_run_unsuccessful',
  'source_run_timeout',
  'upstream_unsuccessful',
  'upstream_outputs_missing',
] as const;
export type AutomationSkipReason = (typeof AUTOMATION_SKIP_REASONS)[number];

// 保存されたエラーは"<code>: <message>"の形。安定した契約はコードの部分だけ。
export function automationSkipReason(
  execution: Pick<ModelAutomationExecution, 'status' | 'error'>,
): AutomationSkipReason | null {
  if (execution.status !== 'skipped' || !execution.error) return null;
  const code = execution.error.split(':', 1)[0];
  return AUTOMATION_SKIP_REASONS.find((reason) => reason === code) ?? null;
}
