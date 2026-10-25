import {
  MAX_JOB_ATTEMPTS,
  type CodeVersion,
  type ModelVersion,
  type RunKind,
} from '@mmt/contracts';
import { parsePositiveInteger } from './formValues';
import { text } from '../i18n/catalog';

export function parseMaxAttempts(value: string): number {
  const attempts = parsePositiveInteger(value);
  if (attempts > MAX_JOB_ATTEMPTS) throw new Error(text.maxAttemptsError);
  return attempts;
}

export const RUN_KINDS: RunKind[] = [
  'inference',
  'evaluation',
  'training',
  'finetuning',
  'processing',
];
/**
 * Runがコードバージョンに求めるもの。`taskType`を実行できることと、`families`（実行するモデル）の
 * すべてのモデル系列に対応していること。省いた部分は確かめない。
 */
export interface CodeRequirement {
  taskType?: RunKind;
  families?: readonly string[];
}

/**
 * コードバージョンが要件を満たすか。APIのvalidateCodeCompatibility
 * （apps/api/src/domain/compatibility.ts）と同じ規則。コードバージョンを選ばせる画面も、選べる
 * ものが無い理由を説明する画面もこれに問い合わせるので、規則はここにだけ置く。
 */
export function meetsCodeRequirement(
  code: CodeVersion,
  { taskType, families = [] }: CodeRequirement,
): boolean {
  return (
    (!taskType || code.taskTypes.includes(taskType)) &&
    families.every((family) => code.supportedModelFamilies.includes(family))
  );
}

export function isCodeCompatible(code: CodeVersion, kind: RunKind, model?: ModelVersion): boolean {
  return meetsCodeRequirement(code, { taskType: kind, families: model ? [model.family] : [] });
}
export function validateCodeCompatibility(
  code: CodeVersion | undefined,
  kind: RunKind,
  model?: ModelVersion,
) {
  if (code && !isCodeCompatible(code, kind, model)) throw new Error(text.launchBlocked);
}
