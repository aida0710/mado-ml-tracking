import {
  DEFAULT_HOOK_MAX_STARTS_PER_HOUR,
  HOOK_CHECKPOINT_MODES,
  HOOK_CONCURRENCY_MODES,
  HOOK_FILTER_FIELDS,
  HOOK_TRIGGERS,
  HOOK_WEBHOOK_SIGNATURES,
  MAX_HOOK_CHECKPOINT_EVERY,
  MAX_HOOK_MAX_STARTS_PER_HOUR,
  type CodeVersion,
  type HookCheckpointMode,
  type HookConcurrency,
  type Hook,
  type HookCreate,
  type HookFilter,
  type HookJobTemplateInput,
  type HookTrigger,
  type HookWebhookSignature,
  type RunKind,
} from '@mmt/contracts';
import type { FormValues } from '../types/form';
import type { HookCatalog } from '../types/hooks';
import {
  getFieldValue,
  getSelectedValues,
  parseChoice,
  parseJsonObject,
  parsePositiveInteger,
  parseStringMap,
} from './formValues';
import { RUN_KINDS, meetsCodeRequirement, parseMaxAttempts } from './executionValidation';
import { isTargetCompatible } from './runtimeValidation';
import { buildJobResources, isSiteTarget, parseArraySize } from './siteExecutionInput';
import { formatClockDuration } from './clockDuration';
import { parseUserRunTags } from './reservedRunTags';
import { LocalizedError } from './localizedError';
import { text } from '../i18n/catalog';
import { hooksTextTemplates } from '../i18n/hooks';

/** モデルバージョンのselectで「きっかけのRunのバージョン」を表す値。実際のバージョンの値はuuid。 */
export const INHERIT_MODEL_VERSION = 'inherit';
// 自動実行ルールと同じく、フックも試行回数を増やしたときだけ再試行する。
const DEFAULT_HOOK_ATTEMPTS = 1;
export const HOOK_RUN_END_STATUSES = ['finished', 'failed', 'canceled'] as const;

export type HookFilterField = keyof HookFilter;

// きっかけのイベントが当てはまり得ない条件はAPIが断るので、ここに挙げたものだけを選ばせる。

export const hookFilterFields = (trigger: HookTrigger): readonly HookFilterField[] =>
  HOOK_FILTER_FIELDS[trigger] ?? [];
/** Run（arrayなら最初のJob）から起きるきっかけ。起動はそのRunのモデルバージョンを引き継げる。 */
export const canInheritModelVersion = (trigger: HookTrigger): boolean =>
  trigger === 'run_finished' || trigger === 'array_finished' || trigger === 'checkpoint_saved';
/** 完了したRunの後に起きるきっかけ。起動はそのRunの出力データセットバージョンを入力にできる。 */
export const canInheritOutputDatasets = (trigger: HookTrigger): boolean =>
  trigger === 'run_finished' || trigger === 'array_finished';
/** model_registeredの起動は、常に登録されたバージョンで実行する。 */
export const usesRegisteredModelVersion = (trigger: HookTrigger): boolean =>
  trigger === 'model_registered';

export function createHookValues(): FormValues {
  return {
    name: '',
    trigger: 'manual',
    filterModelFamilies: [],
    filterExperimentIds: [],
    filterRunKinds: [],
    filterRunStatuses: [],
    filterTags: '{}',
    experimentId: '',
    kind: 'inference',
    modelVersionId: '',
    codeVersionId: '',
    inputDatasetVersionIds: [],
    inheritOutputDatasets: 'false',
    targetId: '',
    gpuIds: [],
    gpuCount: '0',
    walltime: '',
    arraySize: '',
    datasetPartitionVersionId: '',
    parameters: '{}',
    tags: '{}',
    maxAttempts: String(DEFAULT_HOOK_ATTEMPTS),
    retryOnFailure: 'false',
    retryOnTimeout: 'false',
    allowChildJobs: 'false',
    checkpointMode: 'every',
    checkpointEvery: '',
    concurrency: 'queue',
    maxStartsPerHour: String(DEFAULT_HOOK_MAX_STARTS_PER_HOUR),
    webhookSignature: 'github',
  };
}

/**
 * 既存のフックから埋めた、新しいフックのフォーム（[複製して新しく作る]）。設定はすべてそのままで、
 * 名前を`name`にする。フックの設定は作った後で変えられないので、変えるには複製する。webhookの
 * 複製には別の秘密鍵が付く。
 */
export function copyHookValues(hook: Hook, name: string): FormValues {
  const { filter, template } = hook;
  const defaults = createHookValues();
  return {
    ...defaults,
    name,
    trigger: hook.trigger,
    filterModelFamilies: filter.modelFamilies ?? [],
    filterExperimentIds: filter.experimentIds ?? [],
    filterRunKinds: filter.runKinds ?? [],
    filterRunStatuses: filter.runStatuses ?? [],
    filterTags: JSON.stringify(filter.tags ?? {}),
    experimentId: template.experimentId,
    kind: template.kind,
    modelVersionId: template.inheritModelVersion
      ? INHERIT_MODEL_VERSION
      : (template.modelVersionId ?? ''),
    codeVersionId: template.codeVersionId,
    inputDatasetVersionIds: template.inputDatasetVersionIds,
    inheritOutputDatasets: String(template.inheritOutputDatasets),
    targetId: template.targetId,
    gpuIds: template.gpuIds,
    gpuCount: String(template.gpuCount),
    walltime: formatClockDuration(template.walltimeSeconds),
    arraySize: template.arraySize === null ? '' : String(template.arraySize),
    datasetPartitionVersionId: template.datasetPartitionVersionId ?? '',
    parameters: JSON.stringify(template.parameters, null, 2),
    tags: JSON.stringify(template.tags, null, 2),
    maxAttempts: String(template.maxAttempts),
    retryOnFailure: String(template.retryOnFailure),
    retryOnTimeout: String(template.retryOnTimeout),
    allowChildJobs: String(template.allowChildJobs),
    checkpointMode: hook.checkpointMode,
    checkpointEvery: hook.checkpointEvery === null ? '' : String(hook.checkpointEvery),
    concurrency: hook.concurrency,
    maxStartsPerHour: String(hook.maxStartsPerHour),
    // ほかのきっかけのフックは、フォームの既定の署名のままにする（送りはしない）。
    ...(hook.webhookSignature ? { webhookSignature: hook.webhookSignature } : {}),
  };
}

const triggerOf = (values: FormValues) => getFieldValue(values, 'trigger') as HookTrigger;

/** Projectのモデル系列。モデルの系列と、コードバージョンが対応する系列。 */
export function hookModelFamilies(catalog: HookCatalog): string[] {
  const { models, codeVersions } = catalog.registry;
  return [
    ...new Set([
      ...models.map((model) => model.family),
      ...codeVersions.flatMap((version) => version.supportedModelFamilies),
    ]),
  ].sort();
}

/**
 * コードが実行できなければならないモデル系列。モデルバージョンを固定していればその系列、バージョンが
 * イベントから来る（登録か引き継ぎ）なら絞り込みの系列。絞り込みが無ければ系列は分からない。
 */
function requiredFamilies(values: FormValues, catalog: HookCatalog): string[] {
  const modelVersionId = getFieldValue(values, 'modelVersionId');
  const trigger = triggerOf(values);
  const eventFamilies = hookFilterFields(trigger).includes('modelFamilies')
    ? getSelectedValues(values, 'filterModelFamilies')
    : [];
  if (usesRegisteredModelVersion(trigger) || modelVersionId === INHERIT_MODEL_VERSION)
    return eventFamilies;
  const fixed = catalog.registry.modelVersions.find((version) => version.id === modelVersionId);
  return fixed ? [fixed.family] : [];
}

export function isHookCodeCompatible(code: CodeVersion, values: FormValues, catalog: HookCatalog) {
  return meetsCodeRequirement(code, {
    taskType: getFieldValue(values, 'kind') as RunKind,
    families: requiredFamilies(values, catalog),
  });
}

/** arrayがJobごとに分けられる入力のバージョン。選んだ入力のうち、ファイルを持つもの。 */
export function partitionCandidates(values: FormValues, catalog: HookCatalog) {
  const inputs = getSelectedValues(values, 'inputDatasetVersionIds');
  return catalog.registry.datasetVersions.filter(
    (version) => inputs.includes(version.id) && version.contentKind === 'artifacts',
  );
}

/** 変更で選べなくなった選択を外す。自動実行ルールのフォームと同じ。 */
export function updateHookValues({
  previous,
  next,
  catalog,
}: {
  previous: FormValues;
  next: FormValues;
  catalog: HookCatalog;
}): FormValues {
  const updated = { ...next };
  const trigger = triggerOf(next);
  if (getFieldValue(next, 'modelVersionId') === INHERIT_MODEL_VERSION && !canInheritModelVersion(trigger))
    updated.modelVersionId = '';
  if (!canInheritOutputDatasets(trigger)) updated.inheritOutputDatasets = 'false';
  const code = catalog.registry.codeVersions.find((version) => version.id === next.codeVersionId);
  if (code && !isHookCodeCompatible(code, updated, catalog)) updated.codeVersionId = '';
  if (updated.codeVersionId !== previous.codeVersionId) {
    updated.targetId = '';
    updated.gpuIds = [];
  }
  if (updated.targetId !== previous.targetId) updated.gpuIds = [];
  const partitionId = getFieldValue(updated, 'datasetPartitionVersionId');
  if (
    partitionId &&
    (!getFieldValue(updated, 'arraySize').trim() ||
      !partitionCandidates(updated, catalog).some((version) => version.id === partitionId))
  )
    updated.datasetPartitionVersionId = '';
  return updated;
}

function buildFilter(values: FormValues, trigger: HookTrigger): HookFilter {
  const fields = hookFilterFields(trigger);
  const filter: HookFilter = {};
  const selected = (name: string) => [...new Set(getSelectedValues(values, name))];
  if (fields.includes('modelFamilies') && selected('filterModelFamilies').length)
    filter.modelFamilies = selected('filterModelFamilies');
  if (fields.includes('experimentIds') && selected('filterExperimentIds').length)
    filter.experimentIds = selected('filterExperimentIds');
  if (fields.includes('runKinds') && selected('filterRunKinds').length)
    filter.runKinds = selected('filterRunKinds') as RunKind[];
  if (fields.includes('runStatuses') && selected('filterRunStatuses').length)
    filter.runStatuses = selected('filterRunStatuses') as HookFilter['runStatuses'];
  if (fields.includes('tags')) {
    // 絞り込みはタグを読むだけなので、サーバーが付けたタグに当てはめてもよい。
    const tags = parseStringMap(getFieldValue(values, 'filterTags'));
    if (Object.keys(tags).length) filter.tags = tags;
  }
  return filter;
}

function validateReferences(values: FormValues, catalog: HookCatalog) {
  const { experiments, modelVersions, datasetVersions } = catalog.registry;
  const modelVersionId = getFieldValue(values, 'modelVersionId');
  if (
    !experiments.some((experiment) => experiment.id === getFieldValue(values, 'experimentId')) ||
    (modelVersionId &&
      modelVersionId !== INHERIT_MODEL_VERSION &&
      !modelVersions.some((version) => version.id === modelVersionId)) ||
    getSelectedValues(values, 'inputDatasetVersionIds').some(
      (id) => !datasetVersions.some((version) => version.id === id),
    )
  )
    throw new Error(text.hookReferenceError);
}

const isChecked = (values: FormValues, name: string) => getFieldValue(values, name) === 'true';

/** templateのうちsiteだけの部分。array、arrayで分けるバージョン、自動の再実行。 */
function buildSiteTemplate(values: FormValues, catalog: HookCatalog): Partial<HookJobTemplateInput> {
  const arraySize = parseArraySize(getFieldValue(values, 'arraySize'));
  const partitionId = getFieldValue(values, 'datasetPartitionVersionId') || null;
  if (
    partitionId &&
    (arraySize === null ||
      !partitionCandidates(values, catalog).some((version) => version.id === partitionId))
  )
    throw new Error(text.hookPartitionError);
  return {
    ...(arraySize !== null && { arraySize }),
    ...(partitionId && { datasetPartitionVersionId: partitionId }),
    ...(isChecked(values, 'retryOnFailure') && { retryOnFailure: true }),
    ...(isChecked(values, 'retryOnTimeout') && { retryOnTimeout: true }),
  };
}

function buildTemplate(values: FormValues, catalog: HookCatalog): HookJobTemplateInput {
  const trigger = triggerOf(values);
  const kind = getFieldValue(values, 'kind') as RunKind;
  validateReferences(values, catalog);
  const code = catalog.registry.codeVersions.find(
    (version) => version.id === getFieldValue(values, 'codeVersionId'),
  );
  if (!RUN_KINDS.includes(kind) || !code || !isHookCodeCompatible(code, values, catalog))
    throw new Error(text.hookCodeError);
  const target = catalog.targets.find((item) => item.id === getFieldValue(values, 'targetId'));
  if (!target || !isTargetCompatible(target, code)) throw new Error(text.hookTargetError);
  const modelVersionId = getFieldValue(values, 'modelVersionId');
  const inheritModelVersion =
    canInheritModelVersion(trigger) && modelVersionId === INHERIT_MODEL_VERSION;
  const fixedModelVersionId =
    usesRegisteredModelVersion(trigger) || inheritModelVersion ? null : modelVersionId || null;
  return {
    experimentId: getFieldValue(values, 'experimentId'),
    kind,
    codeVersionId: code.id,
    modelVersionId: fixedModelVersionId,
    inheritModelVersion,
    inputDatasetVersionIds: getSelectedValues(values, 'inputDatasetVersionIds'),
    inheritOutputDatasets:
      canInheritOutputDatasets(trigger) && isChecked(values, 'inheritOutputDatasets'),
    parameters: parseJsonObject(getFieldValue(values, 'parameters')),
    tags: parseUserRunTags(getFieldValue(values, 'tags')),
    targetId: target.id,
    ...buildJobResources(target, values),
    ...(isSiteTarget(target) && buildSiteTemplate(values, catalog)),
    maxAttempts: parseMaxAttempts(getFieldValue(values, 'maxAttempts')),
    allowChildJobs: isChecked(values, 'allowChildJobs'),
  };
}

function parseBoundedInteger(value: string, max: number, describeTooLarge: () => string): number {
  const number = parsePositiveInteger(value);
  if (number > max) throw new LocalizedError(describeTooLarge);
  return number;
}

/** フックの起動の決まり。checkpointの規則、重なったときの扱い、回数の上限、webhookの署名。 */
function buildStartRules(values: FormValues, trigger: HookTrigger): Omit<HookCreate, 'name' | 'trigger' | 'filter' | 'template'> {
  const rules: Omit<HookCreate, 'name' | 'trigger' | 'filter' | 'template'> = {
    concurrency: parseChoice<HookConcurrency>(
      getFieldValue(values, 'concurrency'),
      HOOK_CONCURRENCY_MODES,
      text.required,
    ),
    maxStartsPerHour: parseBoundedInteger(
      getFieldValue(values, 'maxStartsPerHour'),
      MAX_HOOK_MAX_STARTS_PER_HOUR,
      () => hooksTextTemplates.hookMaxStartsError(MAX_HOOK_MAX_STARTS_PER_HOUR),
    ),
  };
  if (trigger === 'checkpoint_saved') {
    const mode = parseChoice<HookCheckpointMode>(
      getFieldValue(values, 'checkpointMode'),
      HOOK_CHECKPOINT_MODES,
      text.required,
    );
    rules.checkpointMode = mode;
    if (mode === 'every_k')
      rules.checkpointEvery = parseBoundedInteger(
        getFieldValue(values, 'checkpointEvery'),
        MAX_HOOK_CHECKPOINT_EVERY,
        () => hooksTextTemplates.hookCheckpointEveryError(MAX_HOOK_CHECKPOINT_EVERY),
      );
  }
  if (trigger === 'webhook')
    rules.webhookSignature = parseChoice<HookWebhookSignature>(
      getFieldValue(values, 'webhookSignature'),
      HOOK_WEBHOOK_SIGNATURES,
      text.hookSignatureError,
    );
  return rules;
}

/** フックのフォームの作成の要求。選んだきっかけと実行先の項目だけを送る。 */
export function buildHookInput(values: FormValues, catalog: HookCatalog): HookCreate {
  const name = getFieldValue(values, 'name').trim();
  if (!name) throw new Error(text.hookNameError);
  const trigger = parseChoice(getFieldValue(values, 'trigger'), HOOK_TRIGGERS, text.hookTriggerError);
  return {
    name,
    trigger,
    filter: buildFilter(values, trigger),
    template: buildTemplate(values, catalog),
    ...buildStartRules(values, trigger),
  };
}
