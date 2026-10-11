import type { ComputeTargetVisibility, ProjectVisibility } from '@mmt/contracts';
import { OptionPicker } from './OptionPicker';
import { VisibilityLabel } from './VisibilityLabel';

type Visibility = ProjectVisibility | ComputeTargetVisibility;
const VISIBILITIES: readonly Visibility[] = ['public', 'private'];

/** Chooses Public or Private, with what each choice means (`hints`) under its name. */
export function VisibilityPicker({
  name,
  legend,
  hints,
  value,
  onChange,
}: {
  /** The radio group's name, unique in the form. */
  name: string;
  legend: string;
  hints: Record<Visibility, string>;
  value: Visibility;
  onChange: (visibility: Visibility) => void;
}) {
  return (
    <OptionPicker
      name={name}
      legend={legend}
      options={VISIBILITIES.map((visibility) => ({
        value: visibility,
        label: <VisibilityLabel visibility={visibility} />,
        hint: hints[visibility],
      }))}
      value={value}
      onChange={onChange}
    />
  );
}
