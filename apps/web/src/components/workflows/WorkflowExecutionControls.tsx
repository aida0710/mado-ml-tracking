import { useId, useState } from 'react';
import type { WorkflowExecution, WorkflowExecutionSummary } from '@mmt/contracts';
import { WorkflowLaunchDialog } from '../../dialogs/WorkflowLaunchDialog';
import { WorkflowCancelDialog } from '../../dialogs/WorkflowCancelDialog';
import type { WorkflowLaunchIntent } from '../../lib/workflowLaunchKeys';
import {
  isResumableWorkflowExecution,
  isStoppableWorkflowExecution,
} from '../../lib/workflowExecutionState';
import { workflowsText as labels } from '../../i18n/workflows';
import { useLocale } from '../../i18n/useLocale';

type ControlAction = 'resume' | 'cancel';

/** 実行に今できる操作。失敗・キャンセルした実行の再開か、実行中のものの停止。 */
function allowedAction(execution: WorkflowExecutionSummary): ControlAction | null {
  if (isResumableWorkflowExecution(execution)) return 'resume';
  if (isStoppableWorkflowExecution(execution)) return 'cancel';
  return null;
}

/**
 * 表示中の実行を、それぞれ確認してから再開または停止する。何が起きたかはページが伝える。
 * 編集はできても操作はできない人（できるのは作成者とProject adminだけ）には、ボタンを
 * 消すのでなく理由を出す。
 */
export function WorkflowExecutionControls({
  projectId,
  execution,
  canEdit,
  canControl,
  launch,
  cancel,
  onResumed,
  onCanceled,
}: {
  projectId: string;
  execution: WorkflowExecutionSummary;
  canEdit: boolean;
  /** lib/permissionsのcanControlWorkflowExecution。 */
  canControl: boolean;
  launch: (intent: WorkflowLaunchIntent) => Promise<WorkflowExecution>;
  cancel: (executionId: string) => Promise<WorkflowExecution>;
  onResumed: (started: WorkflowExecution) => void;
  onCanceled: (canceled: WorkflowExecutionSummary) => void;
}) {
  useLocale();
  const resumeHintId = useId();
  const action = allowedAction(execution);
  const [confirming, setConfirming] = useState<{
    action: ControlAction;
    executionId: string;
  } | null>(null);
  // 確認は、開いたときの実行と状態に属する。実行が終わる、ほかの場所で停止される、または別の
  // 実行を表示すると、確認は閉じて戻らない。
  const isConfirming = confirming?.executionId === execution.id && confirming.action === action;
  if (confirming && !isConfirming) setConfirming(null);
  if (!canEdit || !action) return null;
  const confirm = () => setConfirming({ action, executionId: execution.id });
  const close = () => setConfirming(null);
  return (
    <div className="workflow-execution-controls">
      {!canControl ? (
        <p className="muted">{labels.workflowControlOwnerOnly}</p>
      ) : action === 'resume' ? (
        <>
          <button className="button" aria-describedby={resumeHintId} onClick={confirm}>
            {labels.workflowResume}
          </button>
          <p id={resumeHintId} className="muted">
            {labels.workflowResumeHint}
          </p>
        </>
      ) : (
        <button className="button danger" onClick={confirm}>
          {labels.workflowCancel}
        </button>
      )}
      {isConfirming && action === 'resume' && (
        <WorkflowLaunchDialog
          kind="resume"
          execution={execution}
          launch={launch}
          onStarted={(started) => {
            close();
            onResumed(started);
          }}
          onClose={close}
        />
      )}
      {isConfirming && action === 'cancel' && (
        <WorkflowCancelDialog
          projectId={projectId}
          execution={execution}
          cancel={cancel}
          onCanceled={() => {
            close();
            onCanceled(execution);
          }}
          onClose={close}
        />
      )}
    </div>
  );
}
