import { Link } from 'react-router-dom';
import { computerDetailsPath } from '../layout/settingsSections';
import { formatDateTimeSeconds } from '../lib/format';
import type { WorkerCoverage } from '../lib/workerCoverage';
import { workerCoverageLabel } from '../lib/workerCoverageDisplay';
import { useLocale } from '../i18n/useLocale';
import { workerCoverageText, workerCoverageTextTemplates } from '../i18n/workerCoverage';
import { joinSentences } from '../i18n/textJoining';

// Online is the green Job badge, a missing worker the red one; a site needs no worker.
const coverageBadgeClass: Record<WorkerCoverage['state'], string> = {
  online: 'status-success',
  offline: 'status-danger',
  none: 'status-danger',
  notNeeded: 'status-neutral',
};

/** A computer's worker state in a list, with the last answer of workers that went quiet. */
export function WorkerCoverageBadge({ coverage }: { coverage: WorkerCoverage }) {
  useLocale();
  return (
    <span className="badge-group">
      <span className={`status-badge ${coverageBadgeClass[coverage.state]}`}>
        {workerCoverageLabel(coverage)}
      </span>
      {coverage.state === 'offline' && (
        <small className="muted">
          {workerCoverageTextTemplates.workerCoverageOfflineSince(
            formatDateTimeSeconds(coverage.lastSeenAt),
          )}
        </small>
      )}
    </span>
  );
}

/**
 * Why work on a computer does not start: no worker takes it, or its workers stopped answering.
 * `consequence` says what that means where it is shown (a waiting Job, a launch, a Sweep). The
 * link opens the computer's details, where its managers find how to run the worker and everyone
 * else reads who runs it.
 */
export function WorkerMissingNotice({
  target,
  coverage,
  consequence,
}: {
  target: { id: string; name: string };
  coverage: WorkerCoverage;
  consequence: string;
}) {
  useLocale();
  if (coverage.state !== 'none' && coverage.state !== 'offline') return null;
  return (
    <div className="notice error worker-missing" role="status">
      <p>
        {joinSentences([
          coverage.state === 'none'
            ? workerCoverageTextTemplates.targetWorkerNone(target.name)
            : workerCoverageTextTemplates.targetWorkerOffline(target.name, formatDateTimeSeconds(coverage.lastSeenAt)),
          consequence,
        ])}
      </p>
      <p>
        <Link to={computerDetailsPath(target.id)}>{workerCoverageText.workerCoverageSetupLink}</Link>
        <span className="muted"> {workerCoverageText.workerCoverageSetupByOwner}</span>
      </p>
    </div>
  );
}
