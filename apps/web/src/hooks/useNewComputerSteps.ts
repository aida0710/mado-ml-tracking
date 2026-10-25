import { useState } from 'react';
import type { ComputeTargetDetails, TargetCheckWorker } from '@mmt/contracts';
import { executionApi } from '../api/execution';
import {
  buildConnectionPatch,
  buildNewComputerCreate,
  buildSetupPatch,
} from '../lib/computerSetupInput';
import { applyCheckToSetupValues, isConnectionReached } from '../lib/computerSetupValues';
import { isCheckInProgress } from '../lib/targetCheckCandidates';
import type { FormValues } from '../types/form';
import { useMutation } from './useMutation';
import { useTargetCheck } from './useTargetCheck';

export type NewComputerStep = 'connection' | 'setup';

/**
 * Adding an ssh or local computer in two steps. Step 1 saves its connection (disabled) and asks the
 * chosen worker to check it; once the worker reaches it, the setup is filled in from the check and
 * step 2 opens. A failed check stays on step 1 with its reason, and the setup can always be typed
 * by hand instead. Step 2 saves the setup, enabling the computer when 有効 is checked.
 */
export function useNewComputerSteps({
  values,
  changeValues,
  worker,
}: {
  values: FormValues;
  changeValues: (values: FormValues) => void;
  worker: TargetCheckWorker | null;
}) {
  const [step, setStep] = useState<NewComputerStep>('connection');
  const [saved, setSaved] = useState<ComputeTargetDetails | null>(null);
  // The check asked for in step 1, whose end decides whether step 2 opens by itself.
  const [awaitedCheckId, setAwaitedCheckId] = useState<string | null>(null);
  const [isFilledFromCheck, setFilledFromCheck] = useState(false);
  const check = useTargetCheck(saved?.id ?? null);
  const mutation = useMutation();

  // Applied during the render that sees the awaited check end; the values are read as they stand
  // then, and since the check is no longer awaited afterwards, typing does not apply it again.
  const latest = check.latest;
  if (awaitedCheckId !== null && latest?.id === awaitedCheckId && !isCheckInProgress(latest)) {
    setAwaitedCheckId(null);
    if (isConnectionReached(latest) && latest.result) {
      changeValues(applyCheckToSetupValues(values, latest.result));
      setFilledFromCheck(true);
      setStep('setup');
    }
  }

  function saveConnection() {
    return mutation.run(() =>
      saved
        ? executionApi.updateTarget(saved.id, buildConnectionPatch(values, saved))
        : executionApi.createTarget(buildNewComputerCreate(values)),
    );
  }

  async function checkAndContinue() {
    if (!worker) return;
    const connected = await saveConnection();
    if (!connected) return;
    setSaved(connected);
    const requested = await check.request({ checkedTargetId: connected.id, worker });
    if (requested) setAwaitedCheckId(requested.id);
  }

  async function continueWithoutCheck() {
    const connected = await saveConnection();
    if (!connected) return;
    setSaved(connected);
    setAwaitedCheckId(null);
    setStep('setup');
  }

  /** A new check from step 2: its candidates replace the old ones, the values stay as typed. */
  function recheck() {
    if (worker) void check.request({ worker });
  }

  function saveSetup(): Promise<ComputeTargetDetails | undefined> {
    if (!saved) return Promise.resolve(undefined);
    return mutation.run(() => executionApi.updateTarget(saved.id, buildSetupPatch(values, saved)));
  }

  return {
    step,
    backToConnection: () => setStep('connection'),
    saved,
    check,
    isFilledFromCheck,
    // Derived from the check itself, so its end shows at once instead of after the effect runs.
    isWaitingForCheck:
      awaitedCheckId !== null &&
      (check.latest?.id !== awaitedCheckId || isCheckInProgress(check.latest)),
    checkAndContinue,
    continueWithoutCheck,
    recheck,
    saveSetup,
    pending: mutation.pending || check.pending,
    error: mutation.error ?? check.error,
  };
}
