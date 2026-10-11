import type { ModelFamilySummary } from '@mmt/contracts';
import type { FieldSuggestions } from '../types/form';
import { modelsTextTemplates } from '../i18n/models';

/**
 * Families spelled like `family` apart from letter case (`Qwen3` for `qwen3`). Families compare
 * exactly everywhere (code compatibility, automation rules), so such a pair never matches.
 */
export function findFamilyCaseVariants(family: string, families: readonly string[]): string[] {
  const typed = family.trim();
  const folded = typed.toLowerCase();
  return families.filter((name) => name !== typed && name.toLowerCase() === folded);
}

/**
 * Candidates for a model family field: the Project's families that contain what is typed (letter
 * case ignored), each with how many Models and code versions use it. The note tells that the typed
 * family is new, or warns when it differs from an existing one only in letter case.
 */
export function suggestModelFamilies(
  value: string,
  families: readonly ModelFamilySummary[],
): FieldSuggestions {
  const typed = value.trim();
  const folded = typed.toLowerCase();
  const matching = families.filter((family) => family.name.toLowerCase().includes(folded));
  return {
    items: matching.map((family) => family.name),
    details: Object.fromEntries(
      matching.map((family) => [
        family.name,
        modelsTextTemplates.familyUsage(family.modelCount, family.codeVersionCount),
      ]),
    ),
    ...describeTypedFamily(typed, families),
  };
}

function describeTypedFamily(
  typed: string,
  families: readonly ModelFamilySummary[],
): Pick<FieldSuggestions, 'note' | 'noteTone'> {
  if (!typed || families.some((family) => family.name === typed)) return {};
  const variants = findFamilyCaseVariants(
    typed,
    families.map((family) => family.name),
  );
  if (variants.length)
    return { note: modelsTextTemplates.familyCaseVariant(typed, variants), noteTone: 'warning' };
  return { note: modelsTextTemplates.familyNew(typed) };
}
