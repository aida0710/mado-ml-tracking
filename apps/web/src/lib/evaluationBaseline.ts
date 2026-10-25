import type { ModelVersion } from '@mmt/contracts';
import { defaultBaselineAlias } from './evaluationComparisonDisplay';

/** モデルバージョンを比べる相手のバージョン。aliasが指すものか、選んだもの。 */
export type BaselineChoice = { kind: 'alias'; alias: string } | { kind: 'version'; versionId: string };

type VersionOrder = Pick<ModelVersion, 'id' | 'createdAt'>;

/**
 * 既定のalias（productionを優先）。ただし、それが候補自身を指すとき（候補を昇格させた後は
 * そうなる）は、自分自身と比べても差がすべて0になるだけなので、候補の直前に登録された
 * バージョンを代わりに使う。ほかに比べるものが無ければnull。
 */
export function defaultBaselineChoice(input: {
  aliases: Record<string, string>;
  candidateVersionId: string;
  versions: readonly VersionOrder[];
}): BaselineChoice | null {
  const alias = defaultBaselineAlias(input.aliases);
  if (alias && input.aliases[alias] !== input.candidateVersionId) return { kind: 'alias', alias };
  const candidate = input.versions.find((version) => version.id === input.candidateVersionId);
  const previous = input.versions
    .filter((version) => version.id !== input.candidateVersionId)
    .filter((version) => !candidate || version.createdAt < candidate.createdAt)
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0];
  if (previous) return { kind: 'version', versionId: previous.id };
  return alias ? { kind: 'alias', alias } : null;
}

/** 前に選んだものが、今もこのモデルのaliasかバージョンを指しているか。 */
export function isBaselineChoiceAvailable(
  choice: BaselineChoice,
  model: { aliases: Record<string, string>; versions: readonly Pick<ModelVersion, 'id'>[] },
): boolean {
  return choice.kind === 'alias'
    ? Object.hasOwn(model.aliases, choice.alias)
    : model.versions.some((version) => version.id === choice.versionId);
}

export function baselineVersionIdOf(
  choice: BaselineChoice | null,
  aliases: Record<string, string>,
): string | null {
  if (!choice) return null;
  return choice.kind === 'alias' ? (aliases[choice.alias] ?? null) : choice.versionId;
}

// 基準の<select>の値。aliasとバージョンを同じ一覧に並べる。
export function encodeBaselineChoice(choice: BaselineChoice | null): string {
  if (!choice) return '';
  return choice.kind === 'alias' ? `alias:${choice.alias}` : `version:${choice.versionId}`;
}

export function decodeBaselineChoice(value: string): BaselineChoice | null {
  if (value.startsWith('alias:')) return { kind: 'alias', alias: value.slice('alias:'.length) };
  if (value.startsWith('version:'))
    return { kind: 'version', versionId: value.slice('version:'.length) };
  return null;
}
