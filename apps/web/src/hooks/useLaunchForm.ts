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

/** The launch form's steps: what to run, where it runs, and a review before starting. */
export const LAUNCH_STEPS = ['setup', 'resources', 'review'] as const;
export type LaunchStep = (typeof LAUNCH_STEPS)[number];

/**
 * The launch form's values and step, kept consistent: an edit that makes the chosen code or
 * computer no longer fit drops it, and the form names what was dropped (clearedChoices).
 */
export function useLaunchForm<Target extends ComputeTarget>({
  existingRun,
  candidates,
}: {
  existingRun: Run | undefined;
  candidates: LaunchCandidates<Target>;
}) {
  const [step, setStep] = useState<LaunchStep>('setup');
  const [values, setValues] = useState<FormValues>(() => initialLaunchValues(existingRun));
  const [clearedChoices, setClearedChoices] = useState<ClearedLaunchChoice[]>([]);
  const [validationError, setValidationError] = useState<string | null>(null);
  const stepIndex = LAUNCH_STEPS.indexOf(step);
  return {
    values,
    choices: launchChoices(values, candidates),
    clearedChoices,
    changeValues: (next: FormValues) => {
      const change = changeLaunchValues({ previous: values, next, candidates });
      setValues(change.values);
      setClearedChoices(change.cleared);
      setValidationError(null);
    },
    step,
    goForward: () => setStep(LAUNCH_STEPS[stepIndex + 1] ?? step),
    goBack: () => setStep(LAUNCH_STEPS[stepIndex - 1] ?? step),
    validationError,
    setValidationError,
  };
}
