import type {
  Code,
  CodeVersion,
  ExperimentTask,
  Model,
  ModelAutomationRule,
} from '@mmt/contracts';
import { meetsCodeRequirement } from './executionValidation';

/** コードバージョンを実行できる場所と、既に選ばれている場所。 */
export interface CodeVersionUsage {
  /** そのバージョンが対応する系列のモデル。それらのバージョンをこのコードで実行できる。 */
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

/** モデル系列を実行できるコードバージョンと、そのコードの名前。 */
export interface FamilyCodeVersion {
  code: Code;
  version: CodeVersion;
}

/**
 * `family`に対応するコードバージョン。Taskや自動実行ルールがその系列のモデルに選べるコードを
 * 決めるのと同じ規則（meetsCodeRequirement）で選ぶ。
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
