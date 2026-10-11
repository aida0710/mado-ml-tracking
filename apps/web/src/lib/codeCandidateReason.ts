import type { CodeVersion, RunKind } from '@mmt/contracts';
import { findFamilyCaseVariants } from './modelFamilyChoices';

/**
 * Why no code version is offered. no_code_versions: none registered. no_task_type: none runs the
 * kind. no_family: some run the kind but none supports the model's family; caseVariants are the
 * families they list that differ from it only in letter case, the usual slip.
 */
export type MissingCodeReason =
  | { kind: 'no_code_versions' }
  | { kind: 'no_task_type'; taskType: RunKind }
  | { kind: 'no_family'; family: string; caseVariants: string[] };

/**
 * The reason no code version fits, or null when one does. The check matches isCodeCompatible
 * (executionValidation.ts): the code version must run `taskType` and, when a model family is
 * given, support it. Without `taskType` any kind counts (a model version's default code).
 */
export function explainMissingCodeCandidates({
  codeVersions,
  taskType,
  family,
}: {
  codeVersions: readonly CodeVersion[];
  taskType?: RunKind;
  family?: string;
}): MissingCodeReason | null {
  if (!codeVersions.length) return { kind: 'no_code_versions' };
  const runningKind = taskType
    ? codeVersions.filter((code) => code.taskTypes.includes(taskType))
    : codeVersions;
  if (taskType && !runningKind.length) return { kind: 'no_task_type', taskType };
  if (!family || runningKind.some((code) => code.supportedModelFamilies.includes(family)))
    return null;
  const listedFamilies = [...new Set(runningKind.flatMap((code) => code.supportedModelFamilies))];
  return { kind: 'no_family', family, caseVariants: findFamilyCaseVariants(family, listedFamilies) };
}
