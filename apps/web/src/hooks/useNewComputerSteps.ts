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
 * sshまたはlocalのコンピュータを2つの手順で追加する。手順1では接続を（無効のまま）保存し、選んだ
 * workerに確認を頼む。workerがつながったら確認の結果から設定を埋め、手順2を開く。確認に失敗したら
 * 理由を出して手順1にとどまり、設定はいつでも代わりに手で入力できる。手順2では設定を保存し、
 * 有効にチェックがあればコンピュータを有効にする。
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
  // 手順1で頼んだ確認。それが終わったときに、手順2を自動で開くかが決まる。
  const [awaitedCheckId, setAwaitedCheckId] = useState<string | null>(null);
  const [isFilledFromCheck, setFilledFromCheck] = useState(false);
  const check = useTargetCheck(saved?.id ?? null);
  const mutation = useMutation();

  // 待っている確認が終わったのを見たレンダリングの中で当てる。値はその時点のものを読み、その後は
  // もう確認を待っていないので、入力しても再び当てることはない。
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

  /** 手順2からの新しい確認。候補は古いものと入れ替え、値は入力したまま残す。 */
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
    // 確認そのものから導くので、終わったことがeffectの実行を待たずにすぐ表示に出る。
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
