import { useLocale } from '../i18n/useLocale';
import type { ComputeTargetExecutor } from '@mmt/contracts';
import { OptionPicker } from './OptionPicker';
import { computeTargetExecutorLabels } from '../i18n/compute';
import { text } from '../i18n/catalog';

const kindHints: Record<ComputeTargetExecutor, string> = {
  get ssh() { return text.computerKindSshHint },
  get local() { return text.computerKindLocalHint },
  get site() { return text.computerKindSiteHint },
};

/** SSH, Local or Site: how Jobs reach the computer. `kinds` are those one may choose here. */
export function ComputerKindPicker({
  kinds,
  value,
  onChange,
  disabled,
}: {
  kinds: readonly ComputeTargetExecutor[];
  value: ComputeTargetExecutor;
  onChange: (kind: ComputeTargetExecutor) => void;
  disabled?: boolean;
}) {
  useLocale();
  return (
    <OptionPicker
        name="computer-kind"
        legend={text.computerKindLegend}
        options={kinds.map((kind) => ({
          value: kind,
          label: computeTargetExecutorLabels[kind],
          hint: kindHints[kind],
        }))}
        value={value}
        onChange={onChange}
        disabled={disabled}
        hint={disabled ? text.computerKindFixed : undefined}
      />
  );
}
