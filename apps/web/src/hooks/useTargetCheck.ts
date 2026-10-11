import { useEffect, useState } from 'react';
import type { TargetCheckWorker } from '@mmt/contracts';
import { targetChecksApi } from '../api/targetChecks';
import { isCheckInProgress } from '../lib/targetCheckCandidates';
import { useMutation } from './useMutation';
import { useQuery } from './useQuery';

// The worker polls for checks every two seconds and probes for up to two minutes.
export const TARGET_CHECK_POLL_MS = 3000;

/**
 * A computer's latest connection check, read again while a worker has it, and the request of a
 * new one. Without a computer (one not saved yet) nothing is read.
 */
export function useTargetCheck(targetId: string | null) {
  const mutation = useMutation();
  const [isPolling, setPolling] = useState(false);
  const checks = useQuery(
    targetId ? `target-checks:${targetId}` : null,
    (signal) => targetChecksApi.list(targetId!, signal),
    isPolling ? TARGET_CHECK_POLL_MS : undefined,
  );
  const latest = checks.value?.[0];
  // Poll only while the latest check waits for a worker.
  useEffect(() => setPolling(isCheckInProgress(latest)), [latest]);
  /** Asks for a check of `checkedTargetId` (the computer saved just now, before this hook has it). */
  function request({
    checkedTargetId = targetId,
    worker,
  }: {
    checkedTargetId?: string | null;
    worker?: TargetCheckWorker;
  }) {
    if (!checkedTargetId) return Promise.resolve(undefined);
    return mutation
      .run(() => targetChecksApi.request(checkedTargetId, worker))
      .then((created) => {
        if (created) {
          setPolling(true);
          checks.reload();
        }
        return created;
      });
  }
  return {
    checks,
    latest,
    /** The newest check a worker finished: its candidates stay while a new check runs. */
    latestFinished: checks.value?.find((check) => check.status === 'finished'),
    isInProgress: isCheckInProgress(latest),
    request,
    pending: mutation.pending,
    error: mutation.error,
  };
}
