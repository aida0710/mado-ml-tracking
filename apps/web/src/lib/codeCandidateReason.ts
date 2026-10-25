import type { CodeVersion, RunKind } from '@mmt/contracts';
import { meetsCodeRequirement } from './executionValidation';
import { findFamilyCaseVariants } from './modelFamilyChoices';

/**
 * コードバージョンが候補に出ない理由。no_code_versions: 1つも登録されていない。
 * no_task_type: その種類を実行するものが無い。no_family: その種類を実行するものはあるが、
 * どれも`family`に対応していない。caseVariantsは、それらが挙げる系列のうち、`family`と
 * 大文字・小文字だけが違うもの（よくある打ち間違い）。no_common_family: 各系列はどこかで
 * 対応しているが、全部に対応するコードバージョンは1つも無い。
 */
export type MissingCodeReason =
  | { kind: 'no_code_versions' }
  | { kind: 'no_task_type'; taskType: RunKind }
  | { kind: 'no_family'; family: string; caseVariants: string[] }
  | { kind: 'no_common_family'; families: string[] };

/**
 * どのコードバージョンも合わない理由。合うものがあればnull。候補を決めるのと同じ判定である
 * meetsCodeRequirementに問い合わせるので、理由が一覧とずれることはない。コードバージョンは
 * `taskType`を実行でき、`families`（モデルのもの、または自動実行ルールのもの）のすべての系列に
 * 対応していなければならない。`taskType`が無ければどの種類でもよい（モデルバージョンの既定のコード）。
 */
export function explainMissingCodeCandidates({
  codeVersions,
  taskType,
  families = [],
}: {
  codeVersions: readonly CodeVersion[];
  taskType?: RunKind;
  families?: readonly string[];
}): MissingCodeReason | null {
  if (!codeVersions.length) return { kind: 'no_code_versions' };
  const runningKind = codeVersions.filter((code) => meetsCodeRequirement(code, { taskType }));
  if (taskType && !runningKind.length) return { kind: 'no_task_type', taskType };
  if (runningKind.some((code) => meetsCodeRequirement(code, { taskType, families }))) return null;
  const listedFamilies = [...new Set(runningKind.flatMap((code) => code.supportedModelFamilies))];
  const unsupported = families.find((family) => !listedFamilies.includes(family));
  if (unsupported !== undefined)
    return {
      kind: 'no_family',
      family: unsupported,
      caseVariants: findFamilyCaseVariants(unsupported, listedFamilies),
    };
  return { kind: 'no_common_family', families: [...families] };
}
