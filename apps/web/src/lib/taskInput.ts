import type {
  CodeVersion, ComputeTarget, ExperimentTask, ExecutionMode, Model, RunKind, TaskOutputModel,
} from '@mmt/contracts';
import type { CreateTask, LaunchTask } from '../api/inputs';
import type { ExecutionCatalog } from '../types/executionCatalog';
import type { FormValues } from '../types/form';
import { getFieldValue, getSelectedValues, parseJsonObject, parseStringMap } from './formValues';
import { isCodeCompatible, meetsCodeRequirement, RUN_KINDS } from './executionValidation';
import { validateTargetRuntime } from './runtimeValidation';
import { validateFilePath } from './codeWorkspace';
import { formatClockDuration } from './clockDuration';
import { buildJobResources, isSiteTarget } from './siteExecutionInput';
import { text } from '../i18n/catalog';

// 重みを出すのはこの種類だけなので、Task.outputModelを持てるのもこれらだけ。
export const OUTPUT_MODEL_KINDS: readonly RunKind[] = ['training', 'finetuning'];
// 重みを置く慣例のパス（ファイル）。学習のコード例も同じパスを使う。
// APIが登録するのはArtifactのファイル1つ。ここは学習のコード例が重みを記録する場所で、
// JobがMMT_OUTPUTS_DIRに残したファイルは、代わりに`container/`の下に保存される。
export const DEFAULT_OUTPUT_MODEL_ARTIFACT_PATH = 'model/weights.json';

export const hasOutputModel = (kind: RunKind) => OUTPUT_MODEL_KINDS.includes(kind);

/** Taskが登録する先のモデル。名前で指定した既存のものか、これから作るもの。 */
export function outputModelLabel(
  outputModel: Pick<TaskOutputModel, 'modelId' | 'createModel'>,
  catalog: Pick<ExecutionCatalog, 'models'>,
): string {
  if (outputModel.createModel)
    return `${outputModel.createModel.name} · ${outputModel.createModel.family}`;
  const model = catalog.models.find((item) => item.id === outputModel.modelId);
  return model ? `${model.name} · ${model.family}` : (outputModel.modelId ?? '');
}

function createOutputModelValues(outputModel: TaskOutputModel | null | undefined): FormValues {
  return {
    outputModelEnabled: String(!!outputModel),
    outputModelTarget: outputModel?.createModel ? 'create' : 'existing',
    outputModelId: outputModel?.modelId ?? '',
    outputModelName: outputModel?.createModel?.name ?? '',
    outputModelFamily: outputModel?.createModel?.family ?? '',
    outputModelArtifactPath: outputModel?.artifactPath ?? DEFAULT_OUTPUT_MODEL_ARTIFACT_PATH,
    outputModelDefaultCodeVersionId: outputModel?.defaultCodeVersionId ?? '',
  };
}

export function createTaskValues(task?: ExperimentTask, experimentId = ''): FormValues {
  return {
    ...createOutputModelValues(task?.outputModel),
    name: task?.name ?? '', description: task?.description ?? '',
    experimentId: task?.experimentId ?? experimentId, kind: task?.kind ?? 'inference',
    codeVersionId: task?.codeVersionId ?? '', modelVersionId: task?.modelVersionId ?? '',
    inputDatasetVersionIds: task?.inputDatasetVersionIds ?? [],
    parameters: JSON.stringify(task?.parameters ?? {}, null, 2),
    tags: JSON.stringify(task?.tags ?? {}, null, 2),
    targetId: task?.targetId ?? '', gpuIds: task?.gpuIds ?? [],
    gpuCount: String(task?.gpuCount ?? 0), walltime: formatClockDuration(task?.walltimeSeconds ?? null),
  };
}

type TaskResources = Pick<CreateTask, 'gpuIds' | 'gpuCount' | 'walltimeSeconds'>;

/**
 * Taskは、ssh/localのコンピュータにはGPU IDを、siteにはGPU数と制限時間を保存する。Taskの
 * コンピュータが受け取らない種類は、APIの保存と同じく空のままにする。
 */
function buildTaskResources(target: ComputeTarget | undefined, values: FormValues): TaskResources {
  if (!target) {
    if (getSelectedValues(values, 'gpuIds').length) throw new Error(text.gpuSelectionError);
    return { gpuIds: [], gpuCount: 0, walltimeSeconds: null };
  }
  const resources = buildJobResources(target, values);
  return 'gpuIds' in resources
    ? { ...resources, gpuCount: 0, walltimeSeconds: null }
    : { ...resources, gpuIds: [] };
}

function validateTaskVersions(input: CreateTask, catalog: ExecutionCatalog) {
  const model = catalog.modelVersions.find((version) => version.id === input.modelVersionId);
  const code = catalog.codeVersions.find((version) => version.id === input.codeVersionId);
  if (!catalog.experiments.some((experiment) => experiment.id === input.experimentId) ||
    (input.modelVersionId && !model) || input.inputDatasetVersionIds.some((id) =>
      !catalog.datasetVersions.some((version) => version.id === id)))
    throw new Error(text.taskReferenceError);
  if (!code || !isCodeCompatible(code, input.kind, model)) throw new Error(text.taskCodeError);
  return code;
}

/** 学習のコードが出力できるモデル系列。登録するバージョンは、そのようなコードで動かせる必要がある。 */
export function getOutputModelFamilies(code: CodeVersion | undefined): string[] {
  return code?.supportedModelFamilies ?? [];
}

export function getOutputModelCandidates(models: Model[], code: CodeVersion | undefined): Model[] {
  const families = getOutputModelFamilies(code);
  return models.filter((model) => families.includes(model.family));
}

/** 登録するバージョンが持つモデル系列。選んだモデルのものか、新しいモデルのもの。 */
export function getOutputModelFamily(values: FormValues, models: Model[]): string {
  if (getFieldValue(values, 'outputModelTarget') === 'create') return getFieldValue(values, 'outputModelFamily');
  return models.find((model) => model.id === getFieldValue(values, 'outputModelId'))?.family ?? '';
}

export function getDefaultCodeCandidates(codeVersions: CodeVersion[], family: string): CodeVersion[] {
  return family ? codeVersions.filter((version) => meetsCodeRequirement(version, { families: [family] })) : [];
}

function buildEnabledOutputModel({ values, catalog, code, previous }: {
  values: FormValues; catalog: ExecutionCatalog; code: CodeVersion | undefined;
  previous: TaskOutputModel | null | undefined;
}): TaskOutputModel {
  const families = getOutputModelFamilies(code);
  const isCreating = getFieldValue(values, 'outputModelTarget') === 'create';
  const modelId = getFieldValue(values, 'outputModelId');
  const name = getFieldValue(values, 'outputModelName').trim();
  const family = getOutputModelFamily(values, catalog.models);
  if (isCreating ? !name || !family : !catalog.models.some((model) => model.id === modelId))
    throw new Error(text.outputModelTargetError);
  if (!families.includes(family)) throw new Error(text.outputModelFamilyError);
  // バージョンが持つのはArtifactのファイル1つなので、`model/`のようなディレクトリのパスは拒否する。
  const artifactPath = getFieldValue(values, 'outputModelArtifactPath').trim();
  validateFilePath(artifactPath);
  const defaultCodeVersionId = getFieldValue(values, 'outputModelDefaultCodeVersionId') || null;
  if (defaultCodeVersionId && !getDefaultCodeCandidates(catalog.codeVersions, family)
    .some((version) => version.id === defaultCodeVersionId)) throw new Error(text.outputModelCodeError);
  return {
    // フォームの部品が無い項目は保存されたまま残し、Taskを編集しても失われないようにする。
    ...(previous?.versionTemplate !== undefined && { versionTemplate: previous.versionTemplate }),
    ...(previous?.metadata !== undefined && { metadata: previous.metadata }),
    modelId: isCreating ? null : modelId,
    createModel: isCreating ? { name, family } : null,
    artifactPath, defaultCodeVersionId,
  };
}

/**
 * undefinedはこの項目を送らないことを表す。ほかの種類では送らない。ただし、種類を変える前に
 * 保存した設定を消すときはnullを送る。PATCHは省略した項目を残すため。
 */
export function buildTaskOutputModel({ values, catalog, code, kind, previous }: {
  values: FormValues; catalog: ExecutionCatalog; code: CodeVersion | undefined; kind: RunKind;
  previous?: TaskOutputModel | null;
}): TaskOutputModel | null | undefined {
  if (!hasOutputModel(kind)) return previous ? null : undefined;
  if (getFieldValue(values, 'outputModelEnabled') !== 'true') return null;
  return buildEnabledOutputModel({ values, catalog, code, previous });
}

export function buildTaskInput({ values, catalog, targets, task }: {
  values: FormValues; catalog: ExecutionCatalog; targets: ComputeTarget[]; task?: ExperimentTask;
}): CreateTask {
  const kind = getFieldValue(values, 'kind') as RunKind;
  const input: CreateTask = {
    name: getFieldValue(values, 'name').trim(), description: getFieldValue(values, 'description'),
    experimentId: getFieldValue(values, 'experimentId'), kind,
    codeVersionId: getFieldValue(values, 'codeVersionId'), modelVersionId: getFieldValue(values, 'modelVersionId') || null,
    inputDatasetVersionIds: getSelectedValues(values, 'inputDatasetVersionIds'),
    parameters: parseJsonObject(getFieldValue(values, 'parameters')), tags: parseStringMap(getFieldValue(values, 'tags')),
    targetId: getFieldValue(values, 'targetId') || null,
    gpuIds: [], gpuCount: 0, walltimeSeconds: null,
  };
  if (!input.name || !RUN_KINDS.includes(kind)) throw new Error(text.required);
  const code = validateTaskVersions(input, catalog);
  const outputModel = buildTaskOutputModel({ values, catalog, code, kind, previous: task?.outputModel });
  if (outputModel !== undefined) input.outputModel = outputModel;
  const target = input.targetId ? targets.find((item) => item.id === input.targetId) : undefined;
  if (input.targetId) validateTargetRuntime(target, code);
  return { ...input, ...buildTaskResources(target, values) };
}

/**
 * 起動の資源の項目。省略した項目はAPIがTaskから補う。siteでは、ここで変えない限りTaskのGPU数と
 * 制限時間を使い、sshのコンピュータ用に保存したGPU IDは空にする（siteは拒否する）。ssh/localでの
 * 起動では、site用に保存したGPU数と制限時間を空にする。
 */
function buildLaunchResources(task: ExperimentTask, chosen: TaskResources, isSite: boolean):
  Pick<LaunchTask, 'gpuIds' | 'gpuCount' | 'walltimeSeconds'> {
  if (!isSite)
    return {
      gpuIds: chosen.gpuIds,
      ...(task.gpuCount > 0 && { gpuCount: 0 }),
      ...(task.walltimeSeconds !== null && { walltimeSeconds: null }),
    };
  return {
    ...(task.gpuIds.length > 0 && { gpuIds: [] }),
    ...(chosen.gpuCount !== task.gpuCount && { gpuCount: chosen.gpuCount }),
    ...(chosen.walltimeSeconds !== task.walltimeSeconds && { walltimeSeconds: chosen.walltimeSeconds }),
  };
}

export function buildTaskLaunchInput({ task, mode, values, catalog, targets }: {
  task: ExperimentTask; mode: ExecutionMode; values: FormValues;
  catalog: ExecutionCatalog; targets: ComputeTarget[];
}): LaunchTask {
  const launchDefaults = buildTaskInput({ values: {
    ...createTaskValues(task), ...values,
    codeVersionId: task.codeVersionId, experimentId: task.experimentId, kind: task.kind,
    // 起動では、保存済みの出力の設定をAPI側で写すので、画面からは送らない。
    outputModelEnabled: 'false',
  }, catalog, targets });
  if (!launchDefaults.targetId) throw new Error(text.runtimeTargetError);
  const code = catalog.codeVersions.find((version) => version.id === task.codeVersionId)!;
  if (mode === 'test' && !code.testEntrypoint?.length) throw new Error(text.testCommandRequired);
  const target = targets.find((item) => item.id === launchDefaults.targetId);
  return {
    expectedRevision: task.revision, executionMode: mode, targetId: launchDefaults.targetId,
    ...buildLaunchResources(task, launchDefaults, isSiteTarget(target)), name: launchDefaults.name,
    parameters: launchDefaults.parameters, modelVersionId: launchDefaults.modelVersionId,
    inputDatasetVersionIds: launchDefaults.inputDatasetVersionIds,
  };
}

export function updateTaskValues({ previous, next, catalog, targets }: {
  previous: FormValues; next: FormValues; catalog: ExecutionCatalog; targets: ComputeTarget[];
}): FormValues {
  const updated = { ...next };
  const model = catalog.modelVersions.find((item) => item.id === next.modelVersionId);
  const code = catalog.codeVersions.find((item) => item.id === next.codeVersionId);
  if ((next.kind !== previous.kind || next.modelVersionId !== previous.modelVersionId) &&
    code && !isCodeCompatible(code, getFieldValue(next, 'kind') as RunKind, model)) updated.codeVersionId = '';
  const selectedCode = catalog.codeVersions.find((item) => item.id === updated.codeVersionId);
  const target = targets.find((item) => item.id === next.targetId);
  if (selectedCode && target && !target.runtimeKinds.includes(selectedCode.runtime.kind)) updated.targetId = '';
  if (updated.targetId !== previous.targetId) updated.gpuIds = [];
  return clearUnsupportedOutputModel(updated, catalog, selectedCode);
}

// コードを変えるとモデル系列が減ることがあるので、新しいコードで動かせない選択は空にする。
function clearUnsupportedOutputModel(values: FormValues, catalog: ExecutionCatalog, code: CodeVersion | undefined): FormValues {
  const updated = { ...values };
  const families = getOutputModelFamilies(code);
  if (!families.includes(getFieldValue(updated, 'outputModelFamily'))) updated.outputModelFamily = '';
  if (!getOutputModelCandidates(catalog.models, code).some((model) => model.id === updated.outputModelId))
    updated.outputModelId = '';
  const family = getOutputModelFamily(updated, catalog.models);
  if (!getDefaultCodeCandidates(catalog.codeVersions, family)
    .some((version) => version.id === updated.outputModelDefaultCodeVersionId)) updated.outputModelDefaultCodeVersionId = '';
  return updated;
}

export function getExecutionCommand(code: CodeVersion, mode: ExecutionMode) {
  return mode === 'test' ? code.testEntrypoint ?? [] : code.entrypoint;
}
