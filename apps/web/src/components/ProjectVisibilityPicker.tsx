import type { ProjectVisibility } from '@mmt/contracts';
import { VisibilityPicker } from './VisibilityPicker';
import { useLocale } from '../i18n/useLocale';
import { text } from '../i18n/catalog';

const PROJECT_VISIBILITY_HINTS: Record<ProjectVisibility, string> = {
  get public() { return text.projectVisibilityPublicHint; },
  get private() { return text.projectVisibilityPrivateHint; },
};

/** Projectを開ける人を選ぶ。各選択肢の名前の下にその意味を出す。 */
export function ProjectVisibilityPicker({
  name,
  value,
  onChange,
}: {
  name: string;
  value: ProjectVisibility;
  onChange: (visibility: ProjectVisibility) => void;
}) {
  useLocale();
  return (
    <VisibilityPicker
      name={name}
      legend={text.projectVisibility}
      hints={PROJECT_VISIBILITY_HINTS}
      value={value}
      onChange={onChange}
    />
  );
}
