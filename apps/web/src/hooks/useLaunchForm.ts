import type { TrainingContinuation } from '../types/trainingContinuation';
import { checkpointTrainingValues } from '../lib/checkpointTraining';
import { useState } from 'react';
import type { ComputeTarget, Run } from '@mmt/contracts';
import type { FormValues } from '../types/form';
import type { ClearedLaunchChoice } from '../lib/launchFormChanges';
import {
  changeLaunchValues,
  initialLaunchValues,
  launchChoices,
  type LaunchCandidates,
} from '../lib/launchFormValues';
import { useFailureMessage } from './useFailureMessage';

/** 起動フォームの手順。何を実行するか、どこで実行するか、始める前の確認。 */
export const LAUNCH_STEPS = ['setup', 'resources', 'review'] as const;
export type LaunchStep = (typeof LAUNCH_STEPS)[number];

/**
 * 起動フォームの値と手順を、矛盾の無いように保つ。編集で選んだコードやコンピュータが合わなく
 * なったらそれを外し、フォームは何を外したかを伝える（clearedChoices）。
 */
export function useLaunchForm<Target extends ComputeTarget>({
  existingRun,
  continuation,
  candidates,
}: {
  existingRun: Run | undefined;
  continuation?: TrainingContinuation;
  candidates: LaunchCandidates<Target>;
}) {
  const [step, setStep] = useState<LaunchStep>('setup');
  const [values, setValues] = useState<FormValues>(() =>
    continuation ? checkpointTrainingValues(continuation) : initialLaunchValues(existingRun),
  );
  const [clearedChoices, setClearedChoices] = useState<ClearedLaunchChoice[]>([]);
  const validation = useFailureMessage();
  const stepIndex = LAUNCH_STEPS.indexOf(step);
  return {
    values,
    choices: launchChoices(values, candidates),
    clearedChoices,
    changeValues: (next: FormValues) => {
      const change = changeLaunchValues({ previous: values, next, candidates });
      setValues(change.values);
      setClearedChoices(change.cleared);
      validation.clearFailure();
    },
    step,
    goForward: () => setStep(LAUNCH_STEPS[stepIndex + 1] ?? step),
    goBack: () => setStep(LAUNCH_STEPS[stepIndex - 1] ?? step),
    validationError: validation.message,
    setValidationFailure: validation.setFailure,
    clearValidationFailure: validation.clearFailure,
  };
}
