import { useRef } from 'react';
import type { JobListItem } from '@mmt/contracts';
import { executionApi } from '../api/execution';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { cancelEndsAtOnce } from '../lib/jobCancellation';
import { shortId } from '../lib/jobDisplay';
import { useLocale } from '../i18n/useLocale';
import { text } from '../i18n/catalog';
import { jobsTextTemplates } from '../i18n/jobs';

export type JobConfirmAction = 'cancel' | 'retry';

/**
 * Jobを止める、または新しいRunで再実行する前に、Job（そのRun、作った人、動く場所）と起きることを
 * 示して尋ねる。同僚の学習を推測で止めないようにするため。
 * `onDone`は再実行なら新しいRunを、停止のあとならnullを受け取る。
 */
export function JobActionDialog({
  projectId,
  job,
  targetName,
  action,
  onClose,
  onDone,
}: {
  projectId: string;
  job: JobListItem;
  /** コンピュータの名前。Projectから見えなければそのid。 */
  targetName: string;
  action: JobConfirmAction;
  onClose: () => void;
  onDone: (retryRunId: string | null) => void;
}) {
  useLocale();
  const retryRunId = useRef<string | null>(null);
  const isCancel = action === 'cancel';
  const effect = isCancel
    ? cancelEndsAtOnce(job)
      ? text.jobCancelEndsAtOnce
      : text.jobCancelRequestsStop
    : text.jobRetryEffect;
  return (
    <ConfirmDialog
      title={isCancel ? text.jobCancelTitle : text.jobRetryTitle}
      message={
        <>
          {jobsTextTemplates.jobActionTarget({
            runName: job.runName,
            createdByName: job.createdByName ?? shortId(job.createdBy),
            targetName,
          })}
          <br />
          {effect}
        </>
      }
      confirmLabel={isCancel ? text.jobCancelConfirm : text.jobRetryConfirm}
      destructive={isCancel}
      onConfirm={async () => {
        if (isCancel) await executionApi.cancelJob(projectId, job.id);
        else retryRunId.current = (await executionApi.retryJob(projectId, job.id, {})).run.id;
      }}
      onConfirmed={() => onDone(retryRunId.current)}
      onClose={onClose}
    />
  );
}
