import { useState } from 'react';
import type { ModelAutomationRule } from '@mmt/contracts';
import { automationApi, type AutomationExecutionFilter } from '../api/automation';
import { useAutomationHistory } from './useAutomationHistory';
import { useQuery } from './useQuery';
import { useMutation } from './useMutation';

/**
 * A rule being made: from scratch, or as a copy of `source` (rules cannot change once saved, so a
 * fix is a new rule made from the old one's settings).
 */
export interface AutomationRuleDraft {
  source?: ModelAutomationRule;
}

/** A copy that was saved while the rule it came from could not be disabled: both register Jobs. */
export interface SourceRuleLeftEnabled {
  copyName: string;
  sourceId: string;
  sourceName: string;
}

export function useModelAutomation({
  projectId,
  showExecutions,
  historyFilter,
}: {
  projectId: string;
  showExecutions: boolean;
  historyFilter: AutomationExecutionFilter;
}) {
  const rules = useQuery({ key: `${projectId}:automation-rules`, load: (signal) =>
    automationApi.rules(projectId, signal),
  });
  const executions = useAutomationHistory({
    projectId,
    filter: historyFilter,
    enabled: showExecutions,
  });
  const [selectedRuleId, setSelectedRuleId] = useState('');
  const [draft, setDraft] = useState<AutomationRuleDraft | null>(null);
  const [sourceLeftEnabled, setSourceLeftEnabled] = useState<SourceRuleLeftEnabled | null>(null);
  const mutation = useMutation();
  function reload() {
    rules.reload();
    executions.reload();
  }
  async function setEnabled(ruleId: string, enabled: boolean): Promise<boolean> {
    const saved = await mutation.run(() =>
      automationApi.setRuleEnabled(projectId, ruleId, enabled),
    );
    if (!saved) return false;
    rules.reload();
    if (!enabled && ruleId === sourceLeftEnabled?.sourceId) setSourceLeftEnabled(null);
    return true;
  }
  /**
   * Shows a saved rule and, when the person asked, disables the rule it was copied from. If that
   * fails, the new rule exists and the old one stays enabled, so both register Jobs: the old rule
   * is selected, and the notice says so and how to finish.
   */
  async function finishCreating(saved: { rule: ModelAutomationRule; disableSource: boolean }) {
    const source = draft?.source;
    setDraft(null);
    setSourceLeftEnabled(null);
    setSelectedRuleId(saved.rule.id);
    reload();
    if (!source || !saved.disableSource) return;
    if (await setEnabled(source.id, false)) return;
    setSelectedRuleId(source.id);
    setSourceLeftEnabled({
      copyName: saved.rule.name,
      sourceId: source.id,
      sourceName: source.name,
    });
  }
  return {
    rules,
    executions,
    selectedRuleId,
    selectRule: setSelectedRuleId,
    draft,
    startCreating: () => setDraft({}),
    startCopying: (source: ModelAutomationRule) => setDraft({ source }),
    stopCreating: () => setDraft(null),
    finishCreating,
    sourceLeftEnabled,
    setEnabled,
    reload,
    pending: mutation.pending,
    error: mutation.error,
  };
}
