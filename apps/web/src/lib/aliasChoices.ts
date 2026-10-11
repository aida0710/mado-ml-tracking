import type { Model, ModelAliasProtection, PromotionPolicy } from '@mmt/contracts';
import type { FieldSuggestions } from '../types/form';
import { knownAliasSourceLabels, promotionTextTemplates } from '../i18n/promotion';

/** Where an alias name is already used: a Model's alias, a promotion policy, a protection. */
export type KnownAliasSource = 'model' | 'policy' | 'protection';

/**
 * The alias names already in use for a Model, with where each is used. `modelId` null gathers
 * them for every Model of the Project (a protection that covers all Models). Project-wide
 * protections count for every Model.
 */
export function collectKnownAliases({
  models,
  modelId,
  policies,
  protections,
}: {
  models: readonly Model[];
  modelId: string | null;
  policies: readonly PromotionPolicy[];
  protections: readonly ModelAliasProtection[];
}): Map<string, KnownAliasSource[]> {
  const known = new Map<string, KnownAliasSource[]>();
  const add = (alias: string, source: KnownAliasSource) => {
    const sources = known.get(alias) ?? [];
    if (!sources.includes(source)) known.set(alias, [...sources, source]);
  };
  const appliesToModel = (candidate: string | null) =>
    modelId === null || candidate === null || candidate === modelId;
  for (const model of models)
    if (appliesToModel(model.id)) Object.keys(model.aliases).forEach((alias) => add(alias, 'model'));
  for (const policy of policies)
    if (appliesToModel(policy.modelId)) {
      add(policy.targetAlias, 'policy');
      add(policy.baselineAlias, 'policy');
    }
  for (const protection of protections)
    if (appliesToModel(protection.modelId)) add(protection.alias, 'protection');
  return new Map([...known].sort(([left], [right]) => left.localeCompare(right)));
}

/**
 * Candidates for an alias field: known aliases containing what is typed (letter case ignored), each
 * with where it is used. The note tells that a typed name is new, so a slip such as `producton`
 * shows before it silently creates another alias, and warns about a letter-case-only difference.
 */
export function suggestAliasNames(
  value: string,
  known: ReadonlyMap<string, readonly KnownAliasSource[]>,
): FieldSuggestions {
  const typed = value.trim();
  const folded = typed.toLowerCase();
  const items = [...known.keys()].filter((alias) => alias.toLowerCase().includes(folded));
  const details = Object.fromEntries(
    items.map((alias) => [
      alias,
      (known.get(alias) ?? []).map((source) => knownAliasSourceLabels[source]).join('・'),
    ]),
  );
  if (!typed || known.has(typed)) return { items, details };
  const variants = [...known.keys()].filter(
    (alias) => alias !== typed && alias.toLowerCase() === folded,
  );
  if (variants.length)
    return {
      items,
      details,
      note: promotionTextTemplates.aliasCaseVariant(variants),
      noteTone: 'warning',
    };
  return { items, details, note: promotionTextTemplates.aliasNew(typed) };
}
