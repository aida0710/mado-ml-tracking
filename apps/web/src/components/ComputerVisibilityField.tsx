import type { ComputeTarget } from '@mmt/contracts';
import type { FormValues } from '../types/form';
import { VisibilityPicker } from './VisibilityPicker';
import { getFieldValue } from '../lib/formValues';
import { computerVisibilityHints } from '../i18n/computers';
import { text } from '../i18n/catalog';

/**
 * Who may run Jobs on a computer. One from before owners serves everyone; with no one to be
 * private for, it stays public and the field says why.
 */
export function ComputerVisibilityField({
  values,
  onChange,
  target,
}: {
  values: FormValues;
  onChange: (values: FormValues) => void;
  /** The computer being edited; a new one when absent. */
  target?: Pick<ComputeTarget, 'ownerUserId'>;
}) {
  if (target && target.ownerUserId === null)
    return <p className="muted">{text.ownerlessComputerVisibilityNotice}</p>;
  return (
    <VisibilityPicker
      name="target-visibility"
      legend={text.computerVisibility}
      hints={computerVisibilityHints}
      value={getFieldValue(values, 'visibility') === 'public' ? 'public' : 'private'}
      onChange={(visibility) => onChange({ ...values, visibility })}
    />
  );
}
