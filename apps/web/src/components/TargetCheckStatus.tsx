import type { ComputeTarget, TargetCheck } from '@mmt/contracts';
import { TargetCheckItemsTable } from './TargetCheckItemsTable';
import { formatCheckedHost } from '../lib/computeTargetDisplay';
import { isCheckInProgress } from '../lib/targetCheckCandidates';
import { isConnectionReached } from '../lib/computerSetupValues';
import { useLocale } from '../i18n/useLocale';
import { text } from '../i18n/catalog';

/**
 * Where a connection check of the computer being set up stands: waiting for its worker, reached
 * (with the machine it found), or why it could not tell. The items fold away under 確認の詳細.
 */
export function TargetCheckStatus({
  check,
  executor,
}: {
  check: TargetCheck | undefined;
  executor: ComputeTarget['executor'];
}) {
  useLocale();
  if (!check) return null;
  if (isCheckInProgress(check))
    return (
      <p className="notice" role="status" data-testid="target-check-progress">
        {check.status === 'queued' ? text.checkQueued : text.checkRunning}
      </p>
    );
  if (check.failureReason)
    return (
      <p className="notice error" role="status">
        {check.failureReason === 'no_worker' ? text.checkNoWorkerShort : text.checkClaimTimeoutShort}
      </p>
    );
  const isReached = isConnectionReached(check);
  return (
    <div className="target-check-status" data-testid="target-check-status">
      <p className={`notice ${isReached ? 'success' : 'error'}`} role="status">
        {isReached ? text.checkReached : text.checkNotReached}
        {check.result?.version === 2 && isReached && (
          <span className="mono"> {formatCheckedHost(check.result.host)}</span>
        )}
      </p>
      {check.result && (
        <details className="form-details" open={!isReached}>
          <summary>{text.checkDetails}</summary>
          <TargetCheckItemsTable items={check.result.items} executor={executor} />
        </details>
      )}
    </div>
  );
}
