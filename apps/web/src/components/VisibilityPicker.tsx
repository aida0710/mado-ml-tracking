import type { ComputeTargetVisibility, ProjectVisibility } from '@mmt/contracts';
import { OptionPicker } from './OptionPicker';
import { VisibilityLabel } from './VisibilityLabel';

type Visibility = ProjectVisibility | ComputeTargetVisibility;
const VISIBILITIES: readonly Visibility[] = ['public', 'private'];

/** PublicかPrivateかを選ぶ。名前の下に、それぞれを選んだときの意味（`hints`）を出す。 */
export function VisibilityPicker({
  name,
  legend,
  hints,
  value,
  onChange,
}: {
  /** ラジオボタンのグループの名前。フォームの中で一意にする。 */
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
