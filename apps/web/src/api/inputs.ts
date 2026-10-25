import type {
  CodeSource,
  ComputeTarget,
  ComputeTargetSiteFields,
  DatasetVersionContent,
  ExecutionRuntime,
  ExecutionMode,
  ExperimentTask,
  JsonObject,
  ModelAutomationRule,
  PluginDataset,
  RunKind,
  RunStatus,
} from '@mmt/contracts';

export interface CreateRun {
  experimentId: string;
  name: string;
  kind: RunKind;
  executionMode?: ExecutionMode;
  parameters?: JsonObject;
  tags?: Record<string, string>;
  modelVersionId?: string;
  codeVersionId?: string;
  inputDatasetVersionIds?: string[];
  parentRunId?: string;
  resumeCheckpointId?: string;
  environment?: JsonObject;
}
export interface CreateModelVersion {
  /** 省くと、APIがモデルの次の番号（Model.nextVersion）を付ける。 */
  version?: string;
  parentModelVersionIds?: string[];
  sourceRunId?: string;
  weightsUri?: string;
  artifactId?: string;
  defaultCodeVersionId?: string;
  metadata?: JsonObject;
}
export interface CreateCodeVersion {
  version: string;
  source: CodeSource | null;
  runtime: ExecutionRuntime;
  entrypoint: string[];
  testEntrypoint?: string[];
  requirements?: string[];
  environment?: Record<string, string>;
  supportedModelFamilies: string[];
  taskTypes: RunKind[];
}
// summaryMetricsはサーバーで[]になる。ルールのフォームはまだ設定しない。
export type CreateAutomationRule = Omit<
  ModelAutomationRule,
  | 'id'
  | 'projectId'
  | 'createdBy'
  | 'createdByName'
  | 'createdAt'
  | 'summaryMetrics'
  | 'runAsUserId'
  | 'runAsKind'
  | 'runAsName'
> & { summaryMetrics?: string[] };
/** contentなしなら参照するバージョン（version、uri、digest）。contentありならサーバーがuriとdigestを決める。 */
export interface CreateDatasetVersion {
  version?: string;
  uri?: string;
  digest?: string;
  schema?: JsonObject;
  metadata?: JsonObject;
  sourceRunId?: string;
  parentDatasetVersionIds?: string[];
  content?: DatasetVersionContent;
}
export interface CreateToken {
  name: string;
  projectId: string;
  scopes: string[];
  expiresAt?: string | null;
}
/**
 * POST /targetsの本文。コンピュータ自身の項目と公開範囲で、siteなら全体設定と最初のjob shell
 * （ComputeTargetSiteFields）も含む。足した人が所有者になる。
 */
export type CreateTarget = Omit<ComputeTarget, 'id' | 'ownerUserId'> & ComputeTargetSiteFields;
/**
 * PATCH /targets/:idの本文。コンピュータの項目の一部（公開範囲も）とsiteの設定。所有者は変わらず、
 * job shellを編集すると新しいバージョンを保存する（siteComputersApi）。
 */
export type UpdateTarget = Partial<Omit<CreateTarget, 'jobShell'>>;
export type CreateTask = Omit<ExperimentTask, 'id' | 'projectId' | 'revision' | 'createdAt' | 'updatedAt'>;
export type UpdateTask = Partial<Omit<CreateTask, 'experimentId'>> & { expectedRevision: number };
export interface LaunchTask {
  expectedRevision: number;
  executionMode: ExecutionMode;
  targetId?: string;
  gpuIds?: string[];
  /** siteだけ。この起動に限り、TaskのGPU数や制限時間を置き換える。 */
  gpuCount?: number;
  walltimeSeconds?: number | null;
  name?: string;
  parameters?: JsonObject;
  modelVersionId?: string | null;
  inputDatasetVersionIds?: string[];
  /** 新しいRunをこのcheckpointから始める。Taskのコードに合うかはAPIが確かめる。 */
  resumeCheckpointId?: string;
}
/**
 * POST /projects/:p/jobsの本文。ssh・localのコンピュータはgpuIdsを受け取り、siteはgpuCount、
 * walltimeSecondsと再実行のフラグを受け取る（違えばAPIはsite_gpu_idsやsite_only_settingを返す）。
 */
export interface CreateJob {
  runId: string;
  targetId: string;
  maxAttempts: number;
  gpuIds?: string[];
  gpuCount?: number;
  walltimeSeconds?: number | null;
  retryOnFailure?: boolean;
  retryOnTimeout?: boolean;
  allowChildJobs?: boolean;
}
/** POST /projects/:p/jobs/launchの本文。新しいRunとそのJobで、Jobが受け付けられたときだけ両方が残る。 */
export interface LaunchJob {
  run: CreateRun;
  job: Omit<CreateJob, 'runId'>;
}
export interface UpdateRun {
  name?: string;
  tags?: Record<string, string>;
  status?: RunStatus;
  environment?: JsonObject;
}
export interface ImportPluginDataset {
  dataset: PluginDataset;
}
