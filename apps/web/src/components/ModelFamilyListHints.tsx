import { Plus } from 'lucide-react';
import { useModelFamilies } from '../hooks/useModelFamilies';
import { useProject } from '../hooks/useProject';
import { splitLines } from '../lib/formValues';
import { findFamilyCaseVariants } from '../lib/modelFamilyChoices';
import { useLocale } from '../i18n/useLocale';
import { modelsTextTemplates } from '../i18n/models';
import { text } from '../i18n/catalog';

/**
 * Under a code version's family list (one per line): the Project's families not listed yet, added
 * with a click, and a warning for a line that differs from an existing family only in letter case,
 * which would keep this code from matching that family's Models.
 */
export function ModelFamilyListHints({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  useLocale();
  const { project } = useProject();
  const { families } = useModelFamilies(project.id);
  const names = families.map((family) => family.name);
  const listed = splitLines(value);
  const caseSlips = listed
    .filter((family) => !names.includes(family))
    .map((family) => ({ family, variants: findFamilyCaseVariants(family, names) }))
    .filter((slip) => slip.variants.length > 0);
  const addable = names.filter((name) => !listed.includes(name));
  const add = (family: string) => onChange([...listed, family].join('\n'));
  if (!caseSlips.length && !addable.length) return null;
  return (
    <div className="model-family-hints">
      {caseSlips.map((slip) => (
        <p key={slip.family} className="suggestion-note warning" role="status">
          {modelsTextTemplates.familyListCaseVariant(slip.family, slip.variants)}
        </p>
      ))}
      {addable.length > 0 && (
        <div className="model-family-choices" role="group" aria-label={text.existingFamilies}>
          <span className="field-hint">{text.existingFamilies}</span>
          {addable.map((family) => (
            <button key={family} type="button" className="button small mono" onClick={() => add(family)}>
              <Plus size={12} aria-hidden="true" />
              {family}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
