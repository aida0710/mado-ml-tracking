import type { ModelFamilySummary } from '@mmt/contracts';
import type { FieldSuggestions } from '../types/form';
import { modelsTextTemplates } from '../i18n/models';

/**
 * 大文字と小文字の違いだけで`family`と綴りが異なる系列（`qwen3`に対する`Qwen3`）。系列はどこでも
 * （コードの対応、自動実行ルール）完全一致で比べるので、こうした組は決して一致しない。
 */
export function findFamilyCaseVariants(family: string, families: readonly string[]): string[] {
  const typed = family.trim();
  const folded = typed.toLowerCase();
  return families.filter((name) => name !== typed && name.toLowerCase() === folded);
}

/**
 * モデル系列の項目の入力候補。Projectの系列のうち、入力した文字を含むもの（大文字と小文字は区別
 * しない）と、それぞれを使うモデルとコードバージョンの数。添える注意では、入力した系列が新しい
 * ことを伝えるか、既存の系列と大文字と小文字だけが違うときに警告する。
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
