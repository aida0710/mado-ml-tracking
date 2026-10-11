import type { CodeVersion, RunKind } from '@mmt/contracts';
import { meetsCodeRequirement } from './executionValidation';
import { findFamilyCaseVariants } from './modelFamilyChoices';

/**
 * Why no code version is offered. no_code_versions: none registered. no_task_type: none runs the
 * kind. no_family: some run the kind but none supports `family`; caseVariants are the families
 * they list that differ from it only in letter case, the usual slip. no_common_family: each of
 * several families is supported somewhere, but no one code version supports them all.
 */
export type MissingCodeReason =
  | { kind: 'no_code_versions' }
  | { kind: 'no_task_type'; taskType: RunKind }
  | { kind: 'no_family'; family: string; caseVariants: string[] }
  | { kind: 'no_common_family'; families: string[] };

/**
 * The reason no code version fits, or null when one does. It asks meetsCodeRequirement, the same
 * check that decides which code versions are offered, so the reason cannot drift from the list:
 * the code version must run `taskType` and support every family of `families` (the model's, or an
 * automation rule's). Without `taskType` any kind counts (a model version's default code).
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
