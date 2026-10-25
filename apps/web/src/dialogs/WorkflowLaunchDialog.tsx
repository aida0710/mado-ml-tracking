import { useRef } from 'react';
import type { WorkflowExecution, WorkflowExecutionSummary } from '@mmt/contracts';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { shortId } from '../lib/jobDisplay';
import type { WorkflowLaunchIntent } from '../lib/workflowLaunchKeys';
import { workflowsText as labels, workflowsTextTemplates } from '../i18n/workflows';
import { useLocale } from '../i18n/useLocale';

/** 確認で始めるもの。ワークフローのバージョンか、失敗・キャンセルした実行のやり直し。 */
type LaunchTarget =
  | { kind: 'start'; workflowName: string; revision: number }
  | { kind: 'resume'; execution: WorkflowExecutionSummary };

/** 表示言語での確認の文言と、送る開始の要求。 */
function describeLaunch(target: LaunchTarget) {
  if (target.kind === 'resume') {
    const { execution } = target;
    return {
      title: labels.workflowResume,
      subject: workflowsTextTemplates.workflowResumeTarget(shortId(execution.id), execution.revision),
      effect: labels.workflowResumeEffect,
      confirmLabel: labels.workflowResumeConfirm,
      intent: { revision: execution.revision, resumeFromExecutionId: execution.id },
    };
  }
  return {
    title: labels.workflowStart,
    subject: workflowsTextTemplates.workflowStartTarget(target.workflowName, target.revision),
    effect: labels.workflowStartEffect,
    confirmLabel: labels.workflowStartConfirm,
    intent: { revision: target.revision },
  };
}

/**
 * ワークフローのバージョンを始める前、または失敗・キャンセルした実行を新しい実行で再開する前に、
 * バージョンと動くものを示して尋ねる。失敗のあとで送り直した確認は同じidempotency keyを使う
 * （useWorkflowActions）ので、実行が2つ始まることはない。
 */
export function WorkflowLaunchDialog({
  launch,
  onStarted,
  onClose,
  ...target
}: LaunchTarget & {
  launch: (intent: WorkflowLaunchIntent) => Promise<WorkflowExecution>;
  onStarted: (execution: WorkflowExecution) => void;
  onClose: () => void;
}) {
  useLocale();
  const started = useRef<WorkflowExecution | null>(null);
  const { title, subject, effect, confirmLabel, intent } = describeLaunch(target);
  return (
    <ConfirmDialog
      title={title}
      message={
        <>
          {subject}
          <br />
          {effect}
        </>
      }
      confirmLabel={confirmLabel}
      onConfirm={async () => {
        started.current = await launch(intent);
      }}
      onConfirmed={() => {
        if (started.current) onStarted(started.current);
      }}
      onClose={onClose}
    />
  );
}
