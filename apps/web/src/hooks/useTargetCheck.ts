import { useState } from 'react';
import type { TargetCheckWorker } from '@mmt/contracts';
import { targetChecksApi } from '../api/targetChecks';
import { isCheckInProgress } from '../lib/targetCheckCandidates';
import { useMutation } from './useMutation';
import { useQuery } from './useQuery';

// workerは2秒ごとに確認を取りに来て、最長で2分ほど調べる。
export const TARGET_CHECK_POLL_MS = 3000;

/**
 * コンピュータの最新の接続確認（workerが持っている間は読み直す）と、新しい確認の依頼。
 * コンピュータが無い（まだ保存していない）ときは何も読まない。
 */
export function useTargetCheck(targetId: string | null) {
  const mutation = useMutation();
  const [isPolling, setPolling] = useState(false);
  const checks = useQuery({
    key: targetId ? `target-checks:${targetId}` : null,
    load: (signal) => targetChecksApi.list(targetId!, signal),
    pollMs: isPolling ? TARGET_CHECK_POLL_MS : undefined,
  });
  const latest = checks.value?.[0];
  // 最新の確認がworkerを待っている間だけポーリングする。応答のたびに決め直す。
  const [polledCheck, setPolledCheck] = useState(latest);
  if (polledCheck !== latest) {
    setPolledCheck(latest);
    setPolling(isCheckInProgress(latest));
  }
  /** `checkedTargetId`の確認を頼む（useTargetCheckがまだ受け取っていない、今保存したコンピュータ）。 */
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
    /** workerが終えた最新の確認。新しい確認の実行中もその候補は残る。 */
    latestFinished: checks.value?.find((check) => check.status === 'finished'),
    isInProgress: isCheckInProgress(latest),
    request,
    pending: mutation.pending,
    error: mutation.error,
  };
}
