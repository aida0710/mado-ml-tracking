import { useState } from 'react';
import type { ModelAutomationRule } from '@mmt/contracts';
import { automationApi, type AutomationExecutionFilter } from '../api/automation';
import { useAutomationHistory } from './useAutomationHistory';
import { useQuery } from './useQuery';
import { useMutation } from './useMutation';

/**
 * 作成中のルール。一から作るか、`source`のコピーとして作る（ルールは保存すると変えられないので、
 * 直すときは古いルールの設定から新しいルールを作る）。
 */
export interface AutomationRuleDraft {
  source?: ModelAutomationRule;
}

/** 元のルールを無効にできないまま保存したコピー。両方がJobを登録する。 */
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
   * 保存したルールを出し、利用者が求めていれば、コピー元のルールを無効にする。それに失敗すると、
   * 新しいルールはできて古いルールは有効なままなので、両方がJobを登録する。そのときは古いルールを
   * 選んだ状態にし、お知らせでそのことと、残りの操作の方法を伝える。
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
