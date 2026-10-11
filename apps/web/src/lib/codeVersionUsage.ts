import type {
  Code,
  CodeVersion,
  ExperimentTask,
  Model,
  ModelAutomationRule,
} from '@mmt/contracts';
import { meetsCodeRequirement } from './executionValidation';

/** Where a code version can run and where it is already chosen. */
export interface CodeVersionUsage {
  /** Models of a family the version supports: their versions can run on it. */
  models: Model[];
  tasks: ExperimentTask[];
  rules: ModelAutomationRule[];
}

export function findCodeVersionUsage({
  version,
  models,
  tasks,
  rules,
}: {
  version: CodeVersion;
  models: readonly Model[];
  tasks: readonly ExperimentTask[];
  rules: readonly ModelAutomationRule[];
}): CodeVersionUsage {
  return {
    models: models.filter((model) => meetsCodeRequirement(version, { families: [model.family] })),
    tasks: tasks.filter((task) => task.codeVersionId === version.id),
    rules: rules.filter((rule) => rule.codeVersionId === version.id),
  };
}

/** A code version that can run a model family, with the name of its code. */
export interface FamilyCodeVersion {
  code: Code;
  version: CodeVersion;
}

/**
 * The code versions that support `family`, by the same rule that decides which code a Task or an
 * automation rule may choose for the family's models (meetsCodeRequirement).
 */
export function findFamilyCodeVersions({
  family,
  codes,
  codeVersions,
}: {
  family: string;
  codes: readonly Code[];
  codeVersions: readonly CodeVersion[];
}): FamilyCodeVersion[] {
  return codeVersions.flatMap((version) => {
    const code = codes.find((item) => item.id === version.codeId);
    return code && meetsCodeRequirement(version, { families: [family] }) ? [{ code, version }] : [];
  });
}
