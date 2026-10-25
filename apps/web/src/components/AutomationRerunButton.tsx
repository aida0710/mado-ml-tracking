import { useState } from 'react';
import type { ModelAutomationExecution, ModelAutomationRule } from '@mmt/contracts';
import { automationApi } from '../api/automation';
import { ConfirmDialog } from './ConfirmDialog';
import { manualExecutionErrorMessage } from '../lib/automationManualExecution';
import { rerunRequest } from '../lib/automationRerun';
import { LocalizedError } from '../lib/localizedError';
import { useLocale } from '../i18n/useLocale';
import { automationText } from '../i18n/automation';

/** 実行のルールを同じバージョン（または上流のRun）へもう一度適用する。Project adminだけが使う。 */
export function AutomationRerunButton({
  execution,
  rule,
  projectId,
  onRerun,
}: {
  execution: ModelAutomationExecution;
  rule: ModelAutomationRule;
  projectId: string;
  onRerun: () => void;
}) {
  useLocale();
  const [isConfirming, setIsConfirming] = useState(false);
  return (
    <>
      <button className="button small" onClick={() => setIsConfirming(true)}>
        {automationText.rerun}
      </button>
      {isConfirming && (
        <ConfirmDialog
          title={automationText.rerun}
          message={automationText.rerunConfirmMessage(rule.name)}
          confirmLabel={automationText.rerun}
          onConfirm={() =>
            automationApi
              .createExecution(projectId, rule.id, rerunRequest(execution, rule))
              .catch((failure: unknown) => {
                throw new LocalizedError(() => manualExecutionErrorMessage(failure));
              })
          }
          onConfirmed={() => {
            setIsConfirming(false);
            onRerun();
          }}
          onClose={() => setIsConfirming(false)}
        />
      )}
    </>
  );
}
