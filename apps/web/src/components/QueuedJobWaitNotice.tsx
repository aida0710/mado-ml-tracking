import { Link } from 'react-router-dom';
import { WorkerCoverageBadge, WorkerMissingNotice } from './WorkerCoverage';
import { computerDetailsPath } from '../layout/settingsSections';
import type { QueuedJobWait, WorkerlessJobGroup } from '../lib/queuedJobWait';
import { workerCoverageText, workerCoverageTextTemplates } from '../i18n/workerCoverage';

/**
 * Why the selected queued Job has not started: no worker for its computer (and where to set one
 * up), or a busy computer. A site Job tells its phase in the details instead.
 */
export function QueuedJobWaitNotice({
  wait,
  target,
}: {
  wait: QueuedJobWait | null;
  target: { id: string; name: string } | undefined;
}) {
  if (!wait || !target) return null;
  if (wait.kind === 'notTaken')
    return (
      <div className="notice queued-job-reason" role="status">
        <p>{workerCoverageText.queuedJobNotTaken}</p>
        <ul>
          {workerCoverageText.queuedJobNotTakenReasons.map((reason) => (
            <li key={reason}>{reason}</li>
          ))}
        </ul>
      </div>
    );
  return (
    <WorkerMissingNotice
      target={target}
      coverage={wait.coverage}
      consequence={workerCoverageText.queuedJobWaitsForWorker}
    />
  );
}

/**
 * Above the Jobs list: computers whose queued Jobs wait for a worker that is not there, so nobody
 * waits for Jobs that cannot start. Each links to the computer's details.
 */
export function WorkerlessJobsNotice({ groups }: { groups: WorkerlessJobGroup[] }) {
  if (!groups.length) return null;
  return (
    <section
      className="notice error worker-missing"
      aria-label={workerCoverageText.workerlessJobsTitle}
    >
      <strong>{workerCoverageText.workerlessJobsTitle}</strong>
      <p>{workerCoverageText.workerlessJobsHint}</p>
      <ul>
        {groups.map((group) => (
          <li key={group.target.id}>
            <span>
              {workerCoverageTextTemplates.workerlessJobsCount(group.target.name, group.waitingJobs)}
            </span>{' '}
            <WorkerCoverageBadge coverage={group.coverage} />{' '}
            <Link to={computerDetailsPath(group.target.id)}>
              {workerCoverageText.workerCoverageSetupLink}
            </Link>
          </li>
        ))}
      </ul>
      <p className="muted">{workerCoverageText.workerCoverageSetupByOwner}</p>
    </section>
  );
}
