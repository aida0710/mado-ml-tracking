import type { ComputeTarget, ModelAutomationRule } from '@mmt/contracts';
import type { ExecutionCatalog } from './executionCatalog';

export type AutomationKind = ModelAutomationRule['kind'];
export type AutomationTrigger = ModelAutomationRule['trigger'];
export interface AutomationCatalog {
  registry: ExecutionCatalog;
  targets: ComputeTarget[];
  // 同じProjectのルール。つないだルールの上流の段として選べるようにする。
  rules: ModelAutomationRule[];
}
