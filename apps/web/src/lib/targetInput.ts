import {
  COMPUTE_TARGET_VISIBILITIES,
  CPU_ARCHES,
  DEFAULT_DATASET_CACHE_MAX_BYTES,
  SITE_SUBMISSION_MODES,
  type ComputeTarget,
  type ComputeTargetDetails,
  type ComputeTargetVisibility,
  type CpuArch,
  type ExecutionRuntimeKind,
  type SiteSubmissionMode,
} from '@mmt/contracts';
import type { CreateTarget } from '../api/inputs';
import type { FormValues } from '../types/form';
import {
  getFieldValue,
  getSelectedValues,
  parseChoice,
  parsePositiveInteger,
  splitLines,
} from './formValues';
import { parseRuntimeKinds } from './runtimeValidation';
import { formatClockDuration } from './clockDuration';
import { parseQueueTimeout } from './siteExecutionInput';
import { buildSiteSettingsInput, siteSettingsFormValues } from './siteSettingsInput';
import { findJobShellTemplate, type JobShellTemplate } from './jobShellTemplates';
import { parseJobShellContent } from './jobShellContent';
import { text } from '../i18n/catalog';

// ダイアログはデータセットのcacheの上限をGiBで編集し、APIはバイトで保存する。
export const BYTES_PER_GIB = 1024 ** 3;
// siteはコンテナだけを動かす（APIはpythonをsite_target_settingsで拒否する）。
export const SITE_RUNTIME_KINDS: readonly ExecutionRuntimeKind[] = [
  'docker',
  'singularity',
  'apptainer',
];
// スパコンではApptainerが使えることが多いので、新しいsiteはApptainerを選んだ状態で始める。
export const DEFAULT_SITE_RUNTIME_KINDS: ExecutionRuntimeKind[] = ['apptainer'];
const SSH_DEFAULT_PORT = 22;
const DEFAULT_MAX_CONCURRENT_JOBS = 1;
/**
 * siteが空のままにするComputeTargetの項目。接続先とアカウントはsiteの設定が持ち、入力は
 * runnerがJob tokenで自らダウンロードする。
 */
const SITE_STORED_CONNECTION = {
  host: '',
  port: SSH_DEFAULT_PORT,
  username: '',
  sshKeyPath: '',
  knownHostsPath: '',
  workDirectory: '',
  pythonExecutable: '',
  datasetTransfer: 'direct',
} as const satisfies Partial<CreateTarget>;
// siteだけがこの値から変えられる設定（site以外ではAPIがsite_only_settingを返す）。
const NON_SITE_SETTINGS = {
  submissionMode: 'automatic',
  supportsArray: false,
  queueTimeoutSeconds: null,
} as const satisfies Partial<CreateTarget>;

// 新しいコンピュータは、所有者が全員に公開するまで所有者だけが使う（APIの既定も同じ）。
const DEFAULT_TARGET_VISIBILITY: ComputeTargetVisibility = 'private';

/** コンピュータ自身の項目とsiteの全体設定。POSTとPATCHのどちらもこの形で受け取る。 */
export type TargetInput = Omit<CreateTarget, 'jobShell'>;

export function datasetCacheGiB(target: Pick<ComputeTarget, 'datasetCacheMaxBytes'>): string {
  return String(Math.max(1, Math.round(target.datasetCacheMaxBytes / BYTES_PER_GIB)));
}

function parseSiteRuntimeKinds(values: string[]): ExecutionRuntimeKind[] {
  if (!values.length || values.some((value) => !SITE_RUNTIME_KINDS.includes(value as ExecutionRuntimeKind)))
    throw new Error(text.siteRuntimeKindsError);
  return [...new Set(values)] as ExecutionRuntimeKind[];
}

/**
 * APIが受け取る形のコンピュータ。`previous`は編集中のコンピュータで、APIからバイト単位で設定した
 * cacheの上限は、GiBの欄を変えない限りそのまま残す。
 */
export function buildTargetInput(values: FormValues, previous?: ComputeTarget): TargetInput {
  const executor = parseChoice(getFieldValue(values, 'executor'), ['ssh', 'local', 'site'] as const);
  const cacheGiB = getFieldValue(values, 'datasetCacheMaxGiB');
  const common = {
    name: getFieldValue(values, 'name'),
    executor,
    maxConcurrentJobs: parsePositiveInteger(getFieldValue(values, 'maxConcurrentJobs')),
    enabled: getFieldValue(values, 'enabled') === 'true',
    datasetCacheMaxBytes:
      previous && cacheGiB === datasetCacheGiB(previous)
        ? previous.datasetCacheMaxBytes
        : parsePositiveInteger(cacheGiB) * BYTES_PER_GIB,
    cpuArch: parseChoice<CpuArch>(getFieldValue(values, 'cpuArch'), CPU_ARCHES),
    visibility: parseChoice<ComputeTargetVisibility>(
      getFieldValue(values, 'visibility'),
      COMPUTE_TARGET_VISIBILITIES,
    ),
  };
  if (executor === 'site')
    return {
      ...common,
      ...SITE_STORED_CONNECTION,
      gpuIds: [],
      runtimeKinds: parseSiteRuntimeKinds(getSelectedValues(values, 'siteRuntimeKinds')),
      submissionMode: parseChoice<SiteSubmissionMode>(
        getFieldValue(values, 'submissionMode'),
        SITE_SUBMISSION_MODES,
      ),
      supportsArray: getFieldValue(values, 'supportsArray') === 'true',
      queueTimeoutSeconds: parseQueueTimeout(getFieldValue(values, 'queueTimeout')),
      site: buildSiteSettingsInput(values),
    };
  return {
    ...common,
    ...NON_SITE_SETTINGS,
    host: getFieldValue(values, 'host'),
    port: parsePositiveInteger(getFieldValue(values, 'port')),
    username: getFieldValue(values, 'username'),
    sshKeyPath: getFieldValue(values, 'sshKeyPath'),
    knownHostsPath: getFieldValue(values, 'knownHostsPath'),
    workDirectory: getFieldValue(values, 'workDirectory'),
    pythonExecutable: getFieldValue(values, 'pythonExecutable'),
    runtimeKinds: parseRuntimeKinds(getSelectedValues(values, 'runtimeKinds')),
    gpuIds: splitLines(getFieldValue(values, 'gpuIds')),
    datasetTransfer: getFieldValue(values, 'datasetTransfer') as CreateTarget['datasetTransfer'],
  };
}

/** POST /targets: コンピュータを追加した人が所有者になる。新しいsiteは最初のjob shellも受け取る。 */
export function buildTargetCreate(values: FormValues): CreateTarget {
  const target = buildTargetInput(values);
  if (target.executor !== 'site') return target;
  return { ...target, jobShell: parseJobShellContent(getFieldValue(values, 'jobShell')) };
}

/** 雛形のjob shellと、それに伴う設定を入れたフォーム。 */
export function applyJobShellTemplate(values: FormValues, template: JobShellTemplate): FormValues {
  return {
    ...values,
    jobShell: template.content,
    cancelCommand: template.cancelCommand ?? '',
    supportsArray: String(template.supportsArray),
    gpuAssignment: template.gpuAssignment,
    siteRuntimeKinds: [...template.runtimeKinds],
  };
}

/** job shellの雛形を選ぶと、その内容と既定値を入れる。ほかの変更は打ったとおりに残す。 */
export function updateTargetValues(previous: FormValues, next: FormValues): FormValues {
  const templateKey = getFieldValue(next, 'jobShellTemplate');
  if (templateKey === getFieldValue(previous, 'jobShellTemplate')) return next;
  const template = findJobShellTemplate(templateKey);
  return template ? applyJobShellTemplate(next, template) : next;
}

/**
 * 新しいコンピュータのフォームの値。別の公開範囲を選ぶまではPrivate。研究者はsiteだけを追加でき、
 * 全体管理者はsshのコンピュータから始めて、どのexecutorも選べる。
 */
export function newTargetFormValues({ canAddSshOrLocal }: { canAddSshOrLocal: boolean }): FormValues {
  return {
    name: '',
    executor: canAddSshOrLocal ? 'ssh' : 'site',
    visibility: DEFAULT_TARGET_VISIBILITY,
    host: '',
    port: String(SSH_DEFAULT_PORT),
    username: '',
    sshKeyPath: '',
    knownHostsPath: '',
    workDirectory: '',
    // 接続確認（見つかったPython）から埋めるか、その後に打ち込む。
    pythonExecutable: '',
    runtimeKinds: ['python'],
    siteRuntimeKinds: DEFAULT_SITE_RUNTIME_KINDS,
    gpuIds: '',
    maxConcurrentJobs: String(DEFAULT_MAX_CONCURRENT_JOBS),
    datasetTransfer: 'relay',
    datasetCacheMaxGiB: String(DEFAULT_DATASET_CACHE_MAX_BYTES / BYTES_PER_GIB),
    enabled: 'true',
    submissionMode: 'automatic',
    cpuArch: 'amd64',
    supportsArray: 'false',
    queueTimeout: '',
    ...siteSettingsFormValues(null),
    jobShellTemplate: '',
    jobShell: '',
  };
}

/**
 * 保存済みのコンピュータのフォームの値。両方の種類のRuntimeの選択を埋めておくので、executorを
 * 切り替えても、そのコンピュータが持つコンテナのRuntimeが残る。
 */
export function targetFormValues(target: ComputeTargetDetails): FormValues {
  const containerKinds = target.runtimeKinds.filter((kind) => SITE_RUNTIME_KINDS.includes(kind));
  return {
    name: target.name,
    executor: target.executor,
    visibility: target.visibility,
    host: target.host,
    port: String(target.port),
    username: target.username,
    sshKeyPath: target.sshKeyPath,
    knownHostsPath: target.knownHostsPath,
    workDirectory: target.workDirectory,
    pythonExecutable: target.pythonExecutable,
    runtimeKinds: target.runtimeKinds,
    siteRuntimeKinds: containerKinds.length ? containerKinds : DEFAULT_SITE_RUNTIME_KINDS,
    gpuIds: target.gpuIds.join('\n'),
    maxConcurrentJobs: String(target.maxConcurrentJobs),
    datasetTransfer: target.datasetTransfer,
    datasetCacheMaxGiB: datasetCacheGiB(target),
    enabled: String(target.enabled),
    submissionMode: target.submissionMode,
    cpuArch: target.cpuArch,
    supportsArray: String(target.supportsArray),
    queueTimeout: formatClockDuration(target.queueTimeoutSeconds),
    ...siteSettingsFormValues(target.site),
    jobShellTemplate: '',
    jobShell: '',
  };
}
