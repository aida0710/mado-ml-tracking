import type { FormValues } from '../types/form';
import { VisibilityPicker } from './VisibilityPicker';
import { getFieldValue } from '../lib/formValues';
import { useLocale } from '../i18n/useLocale';
import { computerVisibilityHints } from '../i18n/computers';
import { text } from '../i18n/catalog';

/** Who may run Jobs on a computer. */
export function ComputerVisibilityField({
  values,
  onChange,
}: {
  values: FormValues;
  onChange: (values: FormValues) => void;
}) {
  useLocale();
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
