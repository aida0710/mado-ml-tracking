import { useSearchParams } from 'react-router-dom';
import { parseStepParam } from '../lib/mediaSteps';
import { parseStepsParam, stepsParamOf } from '../lib/mediaCompareSteps';

// URL parameters of the media tabs, so a link opens the same key and step.
const KEY_PARAM = 'mediaKey';
const STEP_PARAM = 'mediaStep';
const STEPS_PARAM = 'mediaSteps';

/**
 * The media key and steps shown by the Run's media tab (one step) and the comparison (a list),
 * kept in the URL like the Artifact tree's folder. Changes replace the history entry, so moving the
 * slider does not fill the back button.
 */
export function useMediaLocation() {
  const [params, setParams] = useSearchParams();
  function update(values: Record<string, string | null>) {
    setParams(
      (previous) => {
        const next = new URLSearchParams(previous);
        for (const [name, value] of Object.entries(values))
          if (value === null) next.delete(name);
          else next.set(name, value);
        return next;
      },
      { replace: true },
    );
  }
  return {
    chosenKey: params.get(KEY_PARAM),
    requestedStep: parseStepParam(params.get(STEP_PARAM)),
    /** null: the default columns; []: each Run's latest step. */
    steps: parseStepsParam(params.get(STEPS_PARAM)),
    /** A new key keeps the step; the panel snaps it to the nearest step the key recorded. */
    setKey: (key: string) => update({ [KEY_PARAM]: key }),
    setStep: (step: number) => update({ [STEP_PARAM]: String(step) }),
    /** The comparison goes back to the default columns with a new key, since the old steps may not exist for it. */
    setComparedKey: (key: string) => update({ [KEY_PARAM]: key, [STEPS_PARAM]: null }),
    setSteps: (steps: number[] | null) => update({ [STEPS_PARAM]: stepsParamOf(steps) }),
  };
}
