import { Plus } from 'lucide-react';
import { useModelFamilies } from '../hooks/useModelFamilies';
import { useProject } from '../hooks/useProject';
import { splitLines } from '../lib/formValues';
import { findFamilyCaseVariants } from '../lib/modelFamilyChoices';
import { useLocale } from '../i18n/useLocale';
import { modelsTextTemplates } from '../i18n/models';
import { text } from '../i18n/catalog';

/**
 * コードバージョンのモデル系列の一覧（1行に1つ）の下に置く。まだ挙げていないProjectのモデル系列を
 * クリックで足せるようにし、既存のモデル系列と大文字・小文字だけが違う行には警告を出す。そのままでは
 * このコードがそのモデル系列のモデルに一致しなくなるため。
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
