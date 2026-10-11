import type { FormValues } from '../types/form';
import { getFieldValue, getSelectedValues } from './formValues';

/** A choice the launch form dropped because something it depends on changed. */
export type ClearedLaunchChoice = 'codeVersion' | 'target' | 'gpus';

/**
 * Applies an edit of the launch form. A choice that no longer fits what it depends on is dropped,
 * and only then, so the screen can say which one to choose again:
 * - the code version, when the kind or the model version changes and the code does not run them;
 * - the computer (and its GPUs), when the code changes and the computer lacks its runtime;
 * - the GPUs, when the computer changes, since GPU IDs belong to one computer.
 */
export function applyLaunchFormChange({
  previous,
  next,
  isCodeAllowed,
  isTargetAllowed,
}: {
  previous: FormValues;
  next: FormValues;
  /** The chosen code version runs the chosen kind and model version. */
  isCodeAllowed: (values: FormValues) => boolean;
  /** The chosen computer has the chosen code version's runtime. */
  isTargetAllowed: (values: FormValues) => boolean;
}): { values: FormValues; cleared: ClearedLaunchChoice[] } {
  const values = { ...next };
  const cleared: ClearedLaunchChoice[] = [];
  const changed = (name: string) => getFieldValue(previous, name) !== getFieldValue(values, name);
  if (
    getFieldValue(values, 'codeVersionId') &&
    (changed('kind') || changed('modelVersionId')) &&
    !isCodeAllowed(values)
  ) {
    values.codeVersionId = '';
    cleared.push('codeVersion');
  }
  if (getFieldValue(values, 'targetId') && changed('codeVersionId') && !isTargetAllowed(values)) {
    values.targetId = '';
    cleared.push('target');
  }
  if (changed('targetId') && getSelectedValues(values, 'gpuIds').length) {
    values.gpuIds = [];
    // Dropping the computer already says its GPUs went with it.
    if (!cleared.includes('target')) cleared.push('gpus');
  }
  return { values, cleared };
}
