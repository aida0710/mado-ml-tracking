import {
  DEFAULT_JOB_ATTEMPTS,
  type CodeVersion,
  type ComputeTarget,
  type ModelVersion,
  type Run,
  type RunKind,
} from '@mmt/contracts';
import type { CreateRun } from '../api/inputs';
import type { FormValues } from '../types/form';
import { isCodeCompatible } from './executionValidation';
import { getFieldValue, getSelectedValues, parseJsonObject, parseStringMap } from './formValues';
import { applyLaunchFormChange, type ClearedLaunchChoice } from './launchFormChanges';
import { isTargetCompatible } from './runtimeValidation';

/** 実行のフォームで選ぶ元になるもの。Projectのコードバージョンとモデルバージョン、コンピュータ。 */
export interface LaunchCandidates<Target extends ComputeTarget> {
  codeVersions: readonly CodeVersion[];
  modelVersions: readonly ModelVersion[];
  targets: readonly Target[];
  checkpointCodeId?: string | null;
}

/** フォームの値が選んでいるものと、その選択に合うコードバージョンとコンピュータ。 */
export interface LaunchChoices<Target extends ComputeTarget> {
  kind: RunKind;
  model: ModelVersion | undefined;
  /** 選んだ種類とモデルバージョンを実行できるコードバージョン。 */
  compatibleCodes: CodeVersion[];
  /** 実行できないためにフォームが外したコードバージョンの数。 */
  hiddenCodeCount: number;
  selectedCode: CodeVersion | undefined;
  target: Target | undefined;
  /** 選んだコードバージョンのRuntimeを持つコンピュータ。コードを選ぶまでは無い。 */
  compatibleTargets: Target[];
}

/** 新しいRunのフォームか、既にある待機中のRunのJobのフォーム（Runの設定を埋めたもの）。 */
export function initialLaunchValues(existingRun: Run | undefined): FormValues {
  return {
    name: existingRun?.name ?? '',
    experimentId: existingRun?.experimentId ?? '',
    kind: existingRun?.kind ?? 'inference',
    modelVersionId: existingRun?.modelVersionId ?? '',
    codeVersionId: existingRun?.codeVersionId ?? '',
    inputDatasetVersionIds: existingRun?.inputDatasetVersionIds ?? [],
    parameters: JSON.stringify(existingRun?.parameters ?? {}, null, 2),
    tags: JSON.stringify(existingRun?.tags ?? {}, null, 2),
    environment: JSON.stringify(existingRun?.environment ?? {}, null, 2),
    targetId: '',
    gpuIds: [],
    gpuCount: '0',
    walltime: '',
    maxAttempts: String(DEFAULT_JOB_ATTEMPTS),
    retryOnFailure: 'false',
    retryOnTimeout: 'false',
    allowChildJobs: 'false',
  };
}

function findChosen<Item extends { id: string }>(
  items: readonly Item[],
  values: FormValues,
  field: string,
): Item | undefined {
  return items.find((item) => item.id === getFieldValue(values, field));
}

export function launchChoices<Target extends ComputeTarget>(
  values: FormValues,
  candidates: LaunchCandidates<Target>,
): LaunchChoices<Target> {
  const kind = getFieldValue(values, 'kind') as RunKind;
  const model = findChosen(candidates.modelVersions, values, 'modelVersionId');
  const compatibleCodes = candidates.codeVersions.filter(
    (version) =>
      isCodeCompatible(version, kind, model) &&
      (candidates.checkpointCodeId === undefined || version.codeId === candidates.checkpointCodeId),
  );
  const selectedCode = findChosen(compatibleCodes, values, 'codeVersionId');
  return {
    kind,
    model,
    compatibleCodes,
    hiddenCodeCount: candidates.codeVersions.length - compatibleCodes.length,
    selectedCode,
    target: findChosen(candidates.targets, values, 'targetId'),
    compatibleTargets: selectedCode
      ? candidates.targets.filter((item) => isTargetCompatible(item, selectedCode))
      : [],
  };
}

/**
 * フォームの編集を当てる。選んだ種類とモデルを実行しなくなったコードバージョンや、選んだコードの
 * Runtimeが無いコンピュータは外す（どれを外したかはapplyLaunchFormChangeが伝える）。
 */
export function changeLaunchValues<Target extends ComputeTarget>({
  previous,
  next,
  candidates,
}: {
  previous: FormValues;
  next: FormValues;
  candidates: LaunchCandidates<Target>;
}): { values: FormValues; cleared: ClearedLaunchChoice[] } {
  return applyLaunchFormChange({
    previous,
    next,
    isCodeAllowed: (values) => Boolean(launchChoices(values, candidates).selectedCode),
    isTargetAllowed: (values) => {
      const code = findChosen(candidates.codeVersions, values, 'codeVersionId');
      const target = findChosen(candidates.targets, values, 'targetId');
      return Boolean(code && target && isTargetCompatible(target, code));
    },
  });
}

/**
 * フォームが表すRun。オブジェクトでないJSONの項目（タグなら文字列のマップでないもの）があれば、
 * その読み取りのエラーを投げ、設定の手順をそこで止められるようにする。
 */
export function launchRunInput(values: FormValues): CreateRun {
  return {
    name: getFieldValue(values, 'name'),
    experimentId: getFieldValue(values, 'experimentId'),
    kind: getFieldValue(values, 'kind') as RunKind,
    modelVersionId: getFieldValue(values, 'modelVersionId') || undefined,
    codeVersionId: getFieldValue(values, 'codeVersionId'),
    inputDatasetVersionIds: getSelectedValues(values, 'inputDatasetVersionIds'),
    parameters: parseJsonObject(getFieldValue(values, 'parameters')),
    tags: parseStringMap(getFieldValue(values, 'tags')),
    environment: parseJsonObject(getFieldValue(values, 'environment')),
  };
}
