import { useRef } from 'react';
import type { JobListItem } from '@mmt/contracts';
import { executionApi } from '../api/execution';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { cancelEndsAtOnce } from '../lib/jobCancellation';
import { shortId } from '../lib/jobDisplay';
import { text } from '../i18n/catalog';
import { jobsTextTemplates } from '../i18n/jobs';

export type JobConfirmAction = 'cancel' | 'retry';

/**
 * Asks before stopping a Job or retrying it in a new Run, naming the Job (its Run, its creator,
 * where it runs) and what will happen, so nobody stops a colleague's training by a guess.
 * `onDone` gets the new Run of a retry, or null after a stop.
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
  /** The computer's name, or its id when the Project cannot see it. */
  targetName: string;
  action: JobConfirmAction;
  onClose: () => void;
  onDone: (retryRunId: string | null) => void;
}) {
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
