import type { Model, ModelAliasProtection, PromotionPolicy } from '@mmt/contracts';
import type { FieldSuggestions } from '../types/form';
import { knownAliasSourceLabels, promotionTextTemplates } from '../i18n/promotion';
import { joinLabels } from '../i18n/textJoining';

/** aliasの名前が既に使われている場所。モデルのalias、昇格policy、保護alias。 */
export type KnownAliasSource = 'model' | 'policy' | 'protection';

/**
 * モデルで既に使われているaliasの名前と、それぞれの使われている場所。`modelId`がnullのときは
 * Projectの全モデルの分を集める（全モデルにかかる保護aliasのため）。Project全体の保護aliasは
 * どのモデルにも数える。
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
 * aliasの欄の候補。入力した文字を含む既知のalias（大文字と小文字は区別しない）を、それぞれの
 * 使われている場所と一緒に出す。入力した名前が新しいときは注記で知らせるので、`producton`の
 * ような打ち間違いが黙って別のaliasを作る前に目に入る。大文字と小文字だけの違いも警告する。
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
      joinLabels((known.get(alias) ?? []).map((source) => knownAliasSourceLabels[source])),
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
