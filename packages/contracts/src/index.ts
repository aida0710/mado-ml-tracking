export { isSameUuid } from './uuidIdentity.js';
export { containsControlCharacter } from './controlCharacters.js';

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };
export type JsonObject = { [key: string]: JsonValue };
export type ProjectRole = 'viewer' | 'editor' | 'admin';
/**
 * public: 有効な人のユーザーなら誰でも、メンバーでなくてもeditorとしてProjectを開ける。
 * private: メンバー（直接付与とgroupへの付与）だけが開ける。adminのroleは常にmembershipから
 * 来る。
 */
export type ProjectVisibility = 'public' | 'private';
export type RunKind = 'inference' | 'evaluation' | 'training' | 'finetuning' | 'processing';
export * from './datasetUsage.js';
export * from './preprocessingReports.js';
export * from './workflows.js';
export * from './workerCapabilities.js';
import type { WorkerCapability } from './workerCapabilities.js';
export type RunStatus = 'queued' | 'running' | 'finished' | 'failed' | 'canceled';
export type JobStatus = RunStatus | 'claimed';
// 変わらない保存先の名前。環境変数から来る'filesystem'と's3'か、DBに保存したもの。
export type ArtifactBackend = string;
export type { ExecutionRuntime, ExecutionRuntimeKind } from './executionRuntime.js';
export type { ModelAutomationRule, ModelAutomationExecution } from './modelAutomation.js';
export type { CreateAutomationExecution } from './modelAutomation.js';
export type { AutomationRuleOwnerTransfer } from './modelAutomation.js';
export type { ModelAutomationExecutionPage } from './modelAutomation.js';
export type {
  AutomatedRunSummary,
  ModelVersionDetail,
  ModelVersionEvaluationSummary,
  ModelVersionResultRunKind,
  RunDownstreamPage,
} from './modelVersionEvaluations.js';
export { MODEL_VERSION_RESULT_RUN_KINDS } from './modelVersionEvaluations.js';
export type {
  CodeVersionDetail,
  ModelFamilySummary,
  RuleMetricKeys,
  RuleMetricKeySource,
} from './registryLookups.js';
export type { ExecutionMode, ExecutionSnapshot, ExperimentTask, TaskExecution, TaskRunPage, RepositoryFiles } from './experimentTasks.js';
export type { RunOutputRegistration, TaskOutputModel } from './experimentTasks.js';
export type { AuditActorType, AuditEvent, AuditEventPage, AuditOutcome } from './audit.js';
export type { ModelAliasEvent, ModelAliasEventPage, ModelAliasEventSource } from './modelAliases.js';
export type { ModelAliasAssignment, ModelAliasProtection, ModelAliasProtectionInput, ModelAliasProtectionRole } from './modelAliases.js';
export type {
  EvaluationComparison,
  EvaluationComparisonStatus,
  MetricComparison,
  MetricValueSource,
  MetricValueStatus,
} from './evaluation.js';
export { DEFAULT_BASELINE_ALIAS } from './evaluation.js';
export type { ArtifactUpload, ArtifactUploadCreate, ArtifactUploadDetail, ArtifactUploadListItem, ArtifactUploadPart, ArtifactUploadStatus } from './artifactUploads.js';
export type { RunSearchPage, RunSearchRequest } from './runSearch.js';
export type { ArtifactDirectoryEntry, ArtifactListVersions, ArtifactPage, ArtifactTree } from './artifactListing.js';
export type { ArtifactBackendUsage, ArtifactUsage } from './artifactUsage.js';
export type { ArtifactMediaInfo } from './artifactMediaInfo.js';
export { ARTIFACT_MEDIA_INFO_BATCH_LIMIT } from './artifactMediaInfo.js';
export type { ArtifactPreview, ArtifactPreviewKind, ArtifactPreviewStatus, WaveformPeaksPreview } from './artifactPreviews.js';
export { ARTIFACT_PREVIEW_KINDS, BROWSER_AUDIO_ANALYSIS_MAX_BYTES } from './artifactPreviews.js';
import type { DatasetContentKind } from './datasetContent.js';
import type { DatasetTransferMode } from './targetDatasetCache.js';
export type { DatasetTransferMode } from './targetDatasetCache.js';
export { DATASET_TRANSFER_MODES, DEFAULT_DATASET_CACHE_MAX_BYTES, MIN_DATASET_CACHE_MAX_BYTES } from './targetDatasetCache.js';
export type { DatasetContentKind, DatasetVersionContent, DatasetVersionFile, DatasetVersionFileInput, DatasetVersionFilePage } from './datasetContent.js';
export { MAX_DATASET_VERSION_FILES } from './datasetContent.js';
export type { DatasetFolderUpload, DatasetFolderUploadDiscard } from './datasetFolderUploads.js';
export { DATASET_FOLDER_UPLOAD_FOLDER_PATTERN, datasetFolderUploadPrefix, datasetFolderUploadRoot } from './datasetFolderUploads.js';
export type { ArtifactReferences } from './artifactReferences.js';
export { ARTIFACT_REFERENCES_BATCH_LIMIT } from './artifactReferences.js';
export type { Comment, CommentAuthor, CommentCreate, CommentPage, CommentTargetType, CommentUpdate, RunNote, RunNoteUpdate } from './comments.js';
export { COMMENT_MAX_LENGTH, RUN_NOTE_MAX_LENGTH, RUN_NOTE_TAG } from './comments.js';
export type { ProjectGroupBinding, ProjectMember, ProjectMemberGroupRole, UserSearchResult } from './projectAccess.js';
export type { AdminProject, AdminProjectQuery, ProjectCreate, ProjectMemberGrant, ProjectPatch } from './projectAdministration.js';
export type { ServiceAccount, ServiceAccountCreate, ServiceAccountTokenCreate, ServiceAccountUpdate, TokenScope } from './serviceAccounts.js';
export { EXPLICIT_TOKEN_SCOPES, GLOBAL_TOKEN_SCOPES, TOKEN_SCOPE_REQUIRED_ROLE, TOKEN_SCOPES } from './serviceAccounts.js';
export type { TokenPurpose } from './tokenPurposes.js';
export { TOKEN_PURPOSE_LABELS, TOKEN_PURPOSE_SCOPES, TOKEN_PURPOSES } from './tokenPurposes.js';
export { API_ERROR_CODES } from './apiErrors.js';
export type { ApiErrorBody, ApiErrorCode, ApiErrorDetails, ApiErrorDetailValue } from './apiErrors.js';
export type {
  PromotionCriterion,
  PromotionCriterionDirection,
  PromotionCriterionMode,
  PromotionCriterionOutcome,
  PromotionCriterionReason,
  PromotionCriterionResult,
  PromotionDecision,
  PromotionEvaluation,
  PromotionEvaluationPage,
  PromotionEvaluationReason,
  PromotionMissingBaseline,
  PromotionPolicy,
  PromotionPolicyCreate,
  PromotionPolicyPatch,
} from './promotion.js';
export type { PromotionPolicyOwnerTransfer } from './promotion.js';
export { PROMOTION_CRITERIA_MAX, PROMOTION_FIRST_RELEASE_REASON } from './promotion.js';
export type { Account, AdminUser, AdminUserCreate, AdminUserPasswordReset, AdminUserPatch, AdminUserQuery, UserKind } from './adminUsers.js';
export type { DirectorySuggestions, StorageBackend, StorageBackendChoices, StorageBackendCreate, StorageBackendKind, StorageBackendPatch, StorageBackendSource, StorageSettings, StorageTestResult, StorageTestStep } from './storageBackends.js';
export type { ContainerResultArtifact, ContainerResultDataset, ContainerResultMetric, ContainerResultModel, ContainerResultV2, RunOutputDeclaration, WorkerOutputDeclaration, WorkerOutputsRequest, WorkerOutputsResponse } from './workerOutputs.js';
export type { ChartPanelConfig, ChartPanelLayout, ChartSmoothing, ChartXAxis, RunGroupBy } from './chartPanels.js';
export type {
  MetricGroup,
  MetricGroupPoint,
  MetricGroupsRequest,
  MetricGroupsResponse,
  MetricSeries,
  MetricSeriesPoint,
  MetricSeriesRequest,
  MetricSeriesResponse,
  MetricXRange,
} from './metricSeries.js';
export {
  DEFAULT_SERIES_POINTS,
  MAX_GROUPED_RUNS,
  MAX_SERIES_GROUPS,
  MAX_SERIES_KEYS,
  MAX_SERIES_POINTS,
  MAX_SERIES_RUNS,
  RUN_GROUP_NONE,
} from './metricSeries.js';
export type { RunResumeEvent, RunResumeEventPage, RunResumeRequest, RunResumeResult, RunResumeSource, RunSegment } from './runResume.js';
export { RUN_RESUME_REASON_MAX_LENGTH } from './runResume.js';
export type { ArtifactPresence, ArtifactPresenceCheck, ArtifactPresenceItem, SyncBatch, SyncBatchCounts, SyncBatchResult, SyncBatchStatus, SyncRunCreate, SyncTerminalStatus } from './runSync.js';
export {
  SYNC_ARTIFACT_CHECK_MAX_ITEMS,
  SYNC_BATCH_MAX_LOGS,
  SYNC_BATCH_MAX_METRICS,
  SYNC_CLOCK_SKEW_SECONDS,
  SYNC_ORIGIN_MAX_LENGTH,
} from './runSync.js';
export type {
  NotificationChannel,
  NotificationChannelCreate,
  NotificationChannelKind,
  NotificationChannelPatch,
  NotificationDelivery,
  NotificationDeliveryStatus,
  NotificationEvent,
  NotificationEventType,
  NotificationRule,
  NotificationRuleCreate,
  NotificationRuleFilter,
  NotificationRulePatch,
  NotificationRunSummary,
  NotificationTestResult,
} from './notifications.js';
export {
  NOTIFICATION_ENV_PREFIX,
  NOTIFICATION_EVENT_TYPES,
  NOTIFICATION_RECIPIENTS_MAX,
} from './notifications.js';
export type {
  JobRetryRequest,
  RunCheckpoint,
  RunCheckpointArtifact,
  RunCheckpointCreate,
  RunCheckpointFile,
  RunCheckpointManifest,
  RunCheckpointPage,
  RunCheckpointSource,
  RunResumeCheckpointRecord,
  WorkerResumeCheckpoint,
} from './checkpoints.js';
export { DEFAULT_CHECKPOINT_KEEP_COUNT, MLFLOW_CHECKPOINT_PATH_PREFIX } from './checkpoints.js';
export type {
  Sweep,
  SweepCancel,
  SweepCreate,
  SweepEarlyStopping,
  SweepMethod,
  SweepObjective,
  SweepPage,
  SweepParameterDefinition,
  SweepParameterValue,
  SweepPatch,
  SweepStatus,
  SweepStatusReason,
  SweepTrial,
  SweepTrialCounts,
  SweepTrialPage,
  SweepTrialState,
  SweepEarlyTerminateViolation,
  SweepSpaceViolation,
} from './sweeps.js';
export { SWEEP_EARLY_TERMINATE_VIOLATIONS, SWEEP_SPACE_VIOLATIONS } from './sweeps.js';
export type {
  ImportanceUnavailableReason,
  ParameterExclusionReason,
  ParameterImportanceEntry,
  ParameterImportanceRequest,
  ParameterImportanceResult,
  RunAnalysisMetric,
  RunAnalysisObjective,
  RunAnalysisParam,
  RunAnalysisParamKind,
  RunAnalysisRange,
  RunAnalysisRow,
  RunAnalysisTableRequest,
  RunAnalysisTableResponse,
  RunSet,
} from './runAnalysis.js';
export { ANALYSIS_MAX_METRICS, ANALYSIS_MAX_PARAMS, ANALYSIS_MAX_RUNS } from './runAnalysis.js';
export type { ComparedDatasetVersion, ComparedModelVersion, RunComparison, RunComparisonNamespace, RunComparisonRequest, RunComparisonRow, RunComparisonValue } from './runComparison.js';
export { RUN_COMPARISON_MAX_METRIC_KEYS, RUN_COMPARISON_MAX_RUNS, RUN_COMPARISON_MIN_RUNS, RUN_EXPORT_TRUNCATED_HEADER } from './runComparison.js';
export type {
  CpuArch,
  JobArrayCreate,
  JobArrayCreated,
  JobArrayGroup,
  JobEndReason,
  JobPhase,
  ManualSubmissionClaim,
  ManualSubmissionReport,
  ManualSubmissionWaiting,
  RunnerFinish,
  RunnerFinishResult,
  RunnerHeartbeat,
  RunnerLogs,
  RunnerMetrics,
  RunnerOutputs,
  RunnerPhase,
  RunnerStart,
  RunnerState,
  SiteSchedulerCancellation,
  SiteSchedulerCancellationReport,
  SiteSubmission,
  SiteSubmissionClaim,
  SiteSubmissionMode,
  SiteSubmissionReport,
  SiteSubmissionRequester,
  SiteSubmissionResult,
} from './siteExecution.js';
export {
  CPU_ARCHES,
  JOB_END_REASONS,
  JOB_PHASES,
  JOB_SUBMISSION_PHASES,
  MAX_JOB_ARRAY_SIZE,
  MAX_JOB_GPU_COUNT,
  MAX_JOB_WALLTIME_SECONDS,
  SITE_CLAIM_MAX_SUBMISSIONS,
  MAX_QUEUE_TIMEOUT_SECONDS,
  MIN_QUEUE_TIMEOUT_SECONDS,
  SITE_SUBMISSION_MODES,
  SITE_SUBMISSION_REPORT_TIMEOUT_SECONDS,
} from './siteExecution.js';
export type {
  ComputeTargetLauncherStatus,
  ComputeTargetOverview,
  ComputeTargetVisibility,
} from './computeTargetAccess.js';
export { COMPUTE_TARGET_VISIBILITIES } from './computeTargetAccess.js';
export type {
  ComputeTargetDetails,
  ComputeTargetSiteFields,
  Launcher,
  LauncherConfiguration,
  LauncherConnectionCheck,
  LauncherConnectionCheckResult,
  LauncherCreate,
  LauncherCreated,
  LauncherKey,
  LauncherKeyPublish,
  LauncherSite,
  ManualSiteConfiguration,
  SiteAccountMode,
  SiteConnection,
  SiteConnectionCheck,
  SiteConnectionCheckRequest,
  SiteConnectionCheckStatus,
  SiteGpuAssignment,
  SiteJobShell,
  SiteJobShellCreate,
  SiteJobShellSummary,
  SiteKey,
  SiteKeyRotate,
  SiteKeyStatus,
  SitePersonalSettings,
  SitePersonalSettingsInput,
  SitePersonalSettingsLookup,
  SiteSettings,
  SiteSettingsInput,
  SiteSubmissionAccount,
} from './siteComputers.js';
export {
  DEFAULT_SITE_CANCEL_GRACE_SECONDS,
  DEFAULT_SITE_MAX_ACTIVE_SUBMISSIONS,
  DEFAULT_SITE_MAX_OUTPUT_FILES,
  DEFAULT_SITE_RUNNER_PYTHON,
  DEFAULT_SITE_SSH_PORT,
  MAX_JOB_SHELL_BYTES,
  MAX_KNOWN_HOSTS_BYTES,
  MAX_SITE_ACCOUNT_NAME_LENGTH,
  MAX_SITE_CANCEL_COMMAND_LENGTH,
  MAX_SITE_CANCEL_GRACE_SECONDS,
  MAX_SITE_HOST_LENGTH,
  MAX_SITE_JUMP_HOST_LENGTH,
  MAX_SITE_JUMP_HOSTS,
  MAX_SITE_MAX_OUTPUT_FILES,
  MAX_SITE_PATH_LENGTH,
  MAX_SITE_VARIABLE_NAME_LENGTH,
  MAX_SITE_VARIABLE_VALUE_LENGTH,
  MAX_SITE_VARIABLES,
  SITE_ACCOUNT_MODES,
  SITE_ACCOUNT_NAME_PATTERN,
  SITE_CONNECTION_CHECK_STATUSES,
  SITE_CONNECTION_CHECK_TIMEOUT_SECONDS,
  SITE_GPU_ASSIGNMENTS,
  SITE_HOST_PATTERN,
  SITE_JUMP_HOST_PATTERN,
  SITE_KEY_STATUSES,
  SITE_PATH_PATTERN,
  SITE_RUNNER_PYTHON_PATTERN,
  SITE_VARIABLE_NAME_PATTERN,
} from './siteComputers.js';
export type {
  ChildJobCreate,
  ChildJobCreated,
  ChildJobWait,
  Hook,
  HookCheckpointMode,
  HookConcurrency,
  HookCreate,
  HookCreated,
  HookExecution,
  HookExecutionPage,
  HookExecutionStatus,
  HookExecutionSubject,
  HookFilter,
  HookJobTemplate,
  HookJobTemplateInput,
  HookOwnerTransfer,
  HookSkipReason,
  HookToggle,
  HookTrigger,
  HookTriggerRequest,
  HookWebhookSignature,
  JobStatusCounts,
} from './hooks.js';
export {
  CHILD_JOB_WAIT_MAX_SECONDS,
  DEFAULT_HOOK_MAX_STARTS_PER_HOUR,
  HOOK_CHECKPOINT_MODES,
  HOOK_CONCURRENCY_MODES,
  HOOK_FILTER_FIELDS,
  HOOK_PAYLOAD_MAX_BYTES,
  HOOK_PENDING_MAX_AGE_HOURS,
  HOOK_SKIP_REASONS,
  HOOK_TRIGGERS,
  HOOK_WEBHOOK_SIGNATURES,
  HOOK_WEBHOOK_TIMESTAMP_TOLERANCE_SECONDS,
  MAX_ACTIVE_CHILD_JOBS,
  MAX_CHILD_JOBS_PER_PARENT,
  MAX_HOOK_CHECKPOINT_EVERY,
  MAX_HOOK_MAX_STARTS_PER_HOUR,
  MAX_JOB_CHAIN_DEPTH,
  hookWebhookPath,
} from './hooks.js';
import type { CpuArch, JobEndReason, JobPhase, SiteSubmissionMode } from './siteExecution.js';
import type { ComputeTargetVisibility } from './computeTargetAccess.js';
import type { ExecutionRuntime, ExecutionRuntimeKind } from './executionRuntime.js';
import type { ExecutionMode, ExecutionSnapshot } from './experimentTasks.js';
import type { TaskOutputModel } from './experimentTasks.js';
import type { WorkerResumeCheckpoint } from './checkpoints.js';
import type { UserKind } from './adminUsers.js';

export type AuthMode = 'local' | 'oidc' | 'hybrid' | 'development';
export type AuthSource = 'local' | 'oidc';
export interface User {
  id: string;
  email: string;
  displayName: string;
  isAdmin: boolean;
  username: string | null;
  status: 'active' | 'disabled';
  authSources: AuthSource[];
  // 'service'はService Account。ログインの方法を持たず、自分のtokenを通してだけ操作する。
  // 'launcher'はlauncherのユーザーで、launcherのtokenだけを持つ。
  kind: UserKind;
}
export interface Project {
  id: string;
  name: string;
  description: string;
  artifactBackend: ArtifactBackend;
  visibility: ProjectVisibility;
  role: ProjectRole;
  /**
   * ユーザーが直接付与かgroupへの付与でroleを持っている。`role`がpublicの公開設定か、全体管理者の
   * sessionだけから来ているときはfalse。
   */
  isMember: boolean;
  createdAt: string;
}
export interface Experiment {
  id: string;
  projectId: string;
  name: string;
  description: string;
  runCount: number;
  createdAt: string;
}
/**
 * RunのlatestMetricsの値。PostgreSQLはlatest_metricsを組み立てるとき、有限でないdoubleをJSONの
 * 文字列（'NaN'・'Infinity'・'-Infinity'）にする。
 */
export type LatestMetricValue = number | 'NaN' | 'Infinity' | '-Infinity';
export interface MetricPoint {
  name: string;
  value: number;
  step: number;
  timestamp: string;
}
export interface LogEntry {
  timestamp: string;
  level: 'info' | 'warning' | 'error';
  message: string;
}
/**
 * GET /projects/:p/runs/:r/logs: Runのログの行を古い順に返す。`tail`があれば最新のその行数
 * だけ。totalCountはRunが持つ行数で、画面は省いた分を知ることができる。
 */
export interface RunLogList {
  items: LogEntry[];
  totalCount: number;
}
// 画面は最新の行をポーリングする。それより多く読むのはダウンロードで、`tail`を付けない。
export const MAX_RUN_LOG_TAIL = 10_000;
export interface Run {
  id: string;
  projectId: string;
  experimentId: string;
  name: string;
  kind: RunKind;
  status: RunStatus;
  parameters: JsonObject;
  recordedParameters?: JsonObject;
  tags: Record<string, string>;
  latestMetrics: Record<string, LatestMetricValue>;
  modelVersionId: string | null;
  codeVersionId: string | null;
  taskId?: string | null;
  taskRevision?: number | null;
  executionMode?: ExecutionMode;
  executionSnapshot?: ExecutionSnapshot | null;
  inputDatasetVersionIds: string[];
  // 最初に使ったデータセットバージョンと、stepごとの学習データの段階に記録したもの。
  trainingDatasetVersionIds?: string[];
  // inputDatasetVersionIdsのうち、上流のRunが作ったもの。作成時に決まる。
  upstreamDatasetVersionIds: string[];
  outputDatasetVersionIds: string[];
  outputModelVersionIds: string[];
  /** 起動時に写したTaskのoutputModel。登録はRunが終わったときに行う。 */
  outputModelRegistration?: TaskOutputModel | null;
  parentRunId: string | null;
  // このRunが続きを始めるcheckpoint。作成時に決まる（environment.resumeにも同じ値が入る）。
  resumeCheckpointId?: string | null;
  environment: JsonObject;
  createdBy: string;
  /** 画面に出すcreatedByの表示名。ユーザーの記録が無くなっていればnull。 */
  createdByName: string | null;
  createdAt: string;
  startedAt: string | null;
  endedAt: string | null;
  error: string | null;
  // オフラインで記録して同期したRunの元のマシンの名前。オンラインで作ったRunではnull。
  syncOrigin?: string | null;
}
export interface Model {
  id: string;
  projectId: string;
  name: string;
  family: string;
  description: string;
  latestVersion: string | null;
  /** バージョンを指定せずに次に登録したとき、APIが付けるバージョン（ModelVersionCreate）。 */
  nextVersion?: string;
  aliases: Record<string, string>;
  createdAt: string;
}
export interface ModelVersion {
  id: string;
  modelId: string;
  projectId: string;
  version: string;
  family: string;
  sourceRunId: string | null;
  // 読み出し用の値。登録元か、後から足した学習元の関連づけから求める。
  trainingSourceRunId?: string | null;
  parentModelVersionIds: string[];
  weightsUri: string | null;
  artifactId: string | null;
  defaultCodeVersionId: string | null;
  metadata: JsonObject;
  createdAt: string;
}
export interface ModelVersionCreate {
  // バージョンを省くと、APIがMLflowと同じ形の次の整数を振る。
  version?: string;
  parentModelVersionIds?: string[];
  sourceRunId?: string | null;
  weightsUri?: string | null;
  artifactId?: string | null;
  defaultCodeVersionId?: string | null;
  metadata?: JsonObject;
}
export type CodeSource =
  | { kind: 'git'; url: string; commit: string; files?: Record<string, string>; deletedFiles?: string[] }
  | { kind: 'inline'; files: Record<string, string> }
  | { kind: 'artifact'; artifactId: string };
export interface Code {
  id: string;
  projectId: string;
  name: string;
  description: string;
  latestVersion: string | null;
  createdAt: string;
}
export interface CodeVersion {
  id: string;
  codeId: string;
  projectId: string;
  version: string;
  source: CodeSource | null;
  runtime: ExecutionRuntime;
  entrypoint: string[];
  testEntrypoint?: string[];
  requirements: string[];
  environment: Record<string, string>;
  supportedModelFamilies: string[];
  taskTypes: RunKind[];
  createdAt: string;
}
export interface ExternalDatasetRef {
  pluginId: string;
  externalId: string;
  namespace: string;
  name: string;
  version: string;
}
export interface Dataset {
  id: string;
  projectId: string;
  name: string;
  namespace: string;
  description: string;
  latestVersion: string | null;
  // アーカイブしている間だけ入る。新しいRunはそのバージョンを入力として受け付けず、既存のRunは
  // そのまま持つ。
  archivedAt: string | null;
  createdAt: string;
}
// レジストリのライフサイクルのPATCHの本文。少なくとも1つの項目が要る。
export interface ModelUpdate {
  description?: string;
}
export interface ExperimentUpdate {
  // Projectの中で一意。
  name?: string;
  description?: string;
}
export interface DatasetUpdate {
  archived?: boolean;
  description?: string;
}
export interface DatasetVersion {
  id: string;
  datasetId: string;
  projectId: string;
  name: string;
  namespace: string;
  version: string;
  uri: string;
  digest: string;
  schema: JsonObject;
  metadata: JsonObject;
  sourceRunId: string | null;
  parentDatasetVersionIds: string[];
  externalRef: ExternalDatasetRef | null;
  contentKind: DatasetContentKind;
  /** 'artifacts'のバージョンのファイル数と合計バイト数。'reference'のバージョンではnull。 */
  fileCount: number | null;
  totalSize: number | null;
  createdAt: string;
}
export interface Artifact {
  id: string;
  projectId: string;
  runId: string | null;
  path: string;
  backend: ArtifactBackend;
  storageKey: string;
  mimeType: string;
  size: number;
  sha256: string;
  createdAt: string;
  /** Artifactを削除すると入る。削除したArtifactは一覧に出ず、中身は404になる。 */
  deletedAt?: string | null;
}
/**
 * sshとlocalのコンピュータは、workerがSSHで動かす。siteはここでは説明だけを持つ。接続と
 * スケジューラの設定はlauncher（または`mado-tracking submit`）とjob shellが持つので、siteの
 * host・username・鍵のパス・作業ディレクトリ・Pythonは空文字列。
 */
export type ComputeTargetExecutor = 'ssh' | 'local' | 'site';
export interface ComputeTarget {
  id: string;
  name: string;
  host: string;
  port: number;
  username: string;
  sshKeyPath: string;
  knownHostsPath: string;
  workDirectory: string;
  pythonExecutable: string;
  runtimeKinds: ExecutionRuntimeKind[];
  gpuIds: string[];
  maxConcurrentJobs: number;
  enabled: boolean;
  executor: ComputeTargetExecutor;
  /** コンピュータのデータセットのキャッシュ（<workDirectory>/.mmt-cache/datasets）の上限。 */
  datasetCacheMaxBytes: number;
  datasetTransfer: DatasetTransferMode;
  /**
   * siteで、依頼した本人が`mado-tracking submit`で投入するときは'manual'（ログインにOTPを使う
   * siteの場合）。
   */
  submissionMode: SiteSubmissionMode;
  /** 計算ノードのCPU。イメージとSIFはこのCPU向けにビルドしなければならない。 */
  cpuArch: CpuArch;
  /** siteで、job shellがarrayを1回の呼び出しで投入する（MMT_ARRAY_SIZE）。 */
  supportsArray: boolean;
  /** siteで、この秒数を過ぎてもスケジューラの待ち行列にあるJobはqueue_timeoutで失敗する。 */
  queueTimeoutSeconds: number | null;
  /** コンピュータを追加した人。所有者と全体管理者が変更できる。 */
  ownerUserId: string;
  /** public: すべてのProjectのJob。private: 所有者とその人のService AccountのJobだけ。 */
  visibility: ComputeTargetVisibility;
}
export interface Job {
  id: string;
  projectId: string;
  runId: string;
  targetId: string;
  status: JobStatus;
  gpuIds: string[];
  workerId: string | null;
  leaseId: string | null;
  cancelRequested: boolean;
  attempt: number;
  maxAttempts: number;
  createdAt: string;
  startedAt: string | null;
  endedAt: string | null;
  heartbeatAt: string | null;
  exitCode: number | null;
  error: string | null;
  // 導出した値。claimedかrunningで、60秒heartbeatが無いもの。表示のためだけで、statusは
  // 変えない。投入待ちかスケジューラの待ち行列にいるsiteのJobはheartbeatを送らないので、
  // staleにはしない。
  heartbeatStale: boolean;
  /** siteのJobだけ。queuedから終了までの間でJobがどこにいるか。 */
  phase: JobPhase | null;
  /** 求めたGPUの数。ssh・localのJobではgpuIdsの数。 */
  gpuCount: number;
  walltimeSeconds: number | null;
  schedulerJobId: string | null;
  submittedAt: string | null;
  runnerHost: string | null;
  arrayGroupId: string | null;
  arrayIndex: number | null;
  arraySize: number | null;
  endReason: JobEndReason | null;
  /** 自分のJob tokenでこのJobを作ったドライバーのJob。 */
  parentJobId: string | null;
  /** 最初の手動の開始から、フックとドライバーを経てこのJobに至るまでの段数。 */
  chainDepth: number;
  hookId: string | null;
  allowChildJobs: boolean;
  retryOnFailure: boolean;
  retryOnTimeout: boolean;
  datasetPartitionVersionId: string | null;
  /** siteのJobで、投入に使ったjob shellのバージョン。claimされたあとに入る。 */
  siteJobShellId: string | null;
}
/**
 * GET /projects/:p/jobsの1行。JobにRunとTaskの名前を添え、各Runを開かなくても一覧が読める
 * ようにする。sweepEarlyStoppedは、Sweepによる早期停止（Runのタグmmt.sweepEarlyStopped）と
 * 人による取り消しを区別する。どちらもcanceledで終わる。
 */
export interface JobListItem extends Job {
  runName: string;
  runKind: RunKind;
  taskId: string | null;
  taskName: string | null;
  sweepEarlyStopped: boolean;
  /**
   * Jobの作成者（そのRunの作成者）。Jobを止めたり再試行したりできるのは、その人か
   * Project adminだけ。
   */
  createdBy: string;
  /** createdByの表示名。ユーザーの記録が無くなっていればnull。 */
  createdByName: string | null;
  /**
   * 最新のcheckpointからの再試行で、始める元のcheckpointがある。Runがcheckpointを保存したか、
   * checkpointから再開したRunである（resumeFromLatestCheckpointを付けたJobService.retry）。
   */
  hasResumeCheckpoint: boolean;
  /** Sweepが始めたJobなら、そのJobが動かすSweepのtrial。人がそれを再試行したJobには無い。 */
  sweepTrial: JobSweepTrialOrigin | null;
  /** Jobを始めた自動実行ルール（試行か、その自動の再試行）。 */
  automationRule: JobAutomationRuleOrigin | null;
  /**
   * ステップでJobを始めたワークフローの実行（そのRunを使い回す後の実行ではない）。そのような
   * Jobは単独で再試行せず、ワークフローから再開する（409 workflow_retry_required）。
   */
  workflowExecution: JobWorkflowExecutionOrigin | null;
  /**
   * workerがこのJobを取るために、workerInfo.capabilitiesで名乗る必要がある機能
   * （WorkerService.claim）。
   */
  requiredWorkerCapabilities: WorkerCapability[];
}
export interface JobWorkflowExecutionOrigin {
  workflowId: string;
  executionId: string;
}
export interface JobSweepTrialOrigin {
  sweepId: string;
  sweepName: string;
  trialIndex: number;
}
export interface JobAutomationRuleOrigin {
  ruleId: string;
  ruleName: string;
}
export type WorkerPresenceStatus = 'online' | 'offline';
export interface WorkerPresence {
  projectId: string;
  tokenId: string;
  tokenName: string;
  workerId: string;
  version: string;
  hostname: string;
  targetIds: string[] | null;
  parallelJobs: number;
  startedAt: string;
  lastSeenAt: string;
  status: WorkerPresenceStatus;
  activeJobCount: number;
  /** workerが最後のclaimかresumeで名乗った機能。 */
  capabilities: WorkerCapability[];
}
export interface WorkerJob {
  job: Job;
  run: Run;
  target: ComputeTarget;
  codeVersion: CodeVersion;
  modelVersion: ModelVersion | null;
  inputDatasets: DatasetVersion[];
  // Job のコードに渡す token（mado_mtj_）。この claim・resume で新しく発行したときだけ入る。
  // 実行中の Job では null で、プロセスは worker が前に保存した token を使い続ける。
  jobToken: string | null;
  // Runがcheckpointから続きを始めるときに入る。workerはentrypointの前にそれを検証する。
  resumeCheckpoint?: WorkerResumeCheckpoint | null;
  // コードに入力として渡すcheckpoint（checkpoint_savedのフック）。再開ではない。
  inputCheckpoint?: WorkerResumeCheckpoint | null;
  // フックの開始のwebhookの本文か、手動のトリガーのpayload。Jobの中ではtrigger-payload.json。
  triggerPayload?: JsonObject | null;
}
export interface TokenSummary {
  id: string;
  name: string;
  kind: 'personal' | 'service';
  projectId: string | null;
  scopes: string[];
  expiresAt: string | null;
  lastUsedAt: string | null;
  createdAt: string;
  ownerType: 'user' | 'service_account';
  ownerId: string;
  ownerName: string;
  // tokenの値の先頭12文字。
  tokenPrefix: string;
}
// GET /auth/token: 認証に使っているAPI tokenそのもの（Job tokenなら`job`がtrue）。
export interface CurrentApiToken {
  id: string;
  projectId: string | null;
  scopes: string[];
  job: boolean;
}
export interface PluginManifest {
  id: string;
  name: string;
  version: string;
  protocolVersion: '1.0';
  capabilities: string[];
}
export type PluginKind = 'mado';
/** namespaceは、mado S3 Data Catalogがaccess tokenに与えたgrantから来る。ここでは入力しない。 */
export interface MadoPluginConfig {
  apiUrl: string;
  webUrl: string;
  lineageUrl: string;
  jobNamespace: string;
  storageSystemKey: string;
}
/** シークレットは書き込みのリクエストでだけ受け付ける。tokenを省くと保存済みのものを残す。 */
export interface MadoPluginCredentialsInput {
  accessToken?: string;
}
import type { MadoAccessTokenGrant } from './madoAccessTokenGrant.js';
export type { MadoAccessTokenGrant } from './madoAccessTokenGrant.js';
export {
  ALL_MADO_NAMESPACES,
  MADO_SCOPES,
  allowsAllMadoNamespaces,
  allowsMadoNamespace,
} from './madoAccessTokenGrant.js';
export interface PluginCreate {
  kind: 'mado';
  name?: string;
  config: MadoPluginConfig;
  credentials?: MadoPluginCredentialsInput;
  enabled?: boolean;
}
export interface PluginPatch {
  name?: string;
  config?: MadoPluginConfig;
  credentials?: MadoPluginCredentialsInput;
  enabled?: boolean;
  expectedRevision?: number;
}
export interface PluginConnection {
  id: string;
  projectId: string;
  name: string;
  kind: PluginKind;
  config: MadoPluginConfig;
  configRevision: number;
  credentialsConfigured: { accessToken: boolean };
  secretStorageAvailable: boolean;
  /** mado S3 Data Catalogのaccess tokenを、このAPIサーバーで復号できる。 */
  tokenConfigured: boolean;
  enabled: boolean;
  manifest: PluginManifest | null;
  /** 最後の接続確認で入り、接続先かaccess tokenが変わると消える。 */
  accessTokenGrant: MadoAccessTokenGrant | null;
  createdAt: string;
}
/** Projectのviewerに見せてよい情報。認証情報・tokenの参照・サーバー側のAPIの接続先は含まない。 */
export interface PluginAvailability {
  kind: 'mado';
  id: string | null;
  enabled: boolean;
  configured: boolean;
  configRevision: number;
  webUrl: string | null;
  canImport: boolean;
}
export interface PluginDataset {
  externalId: string;
  namespace: string;
  name: string;
  version: string;
  uri: string;
  digest: string;
  schema: JsonObject;
  metadata: JsonObject;
}
export interface PluginEvent {
  id: string;
  type: 'run.started' | 'run.finished' | 'run.failed' | 'run.canceled';
  timestamp: string;
  projectId: string;
  run: Run;
  inputDatasets: DatasetVersion[];
  outputDatasets: DatasetVersion[];
}
export type { LineageRelationAddition } from './lineageRelations.js';

export interface LineageNode {
  id: string;
  kind: 'datasetVersion' | 'modelVersion' | 'loggedModel' | 'run' | 'codeVersion';
  label: string;
  status?: string;
  sourceRunId?: string;
}
export interface LineageEdge {
  source: string;
  target: string;
  relation: string;
}
export interface LineageGraph {
  nodes: LineageNode[];
  edges: LineageEdge[];
}
export interface AuthConfig {
  mode: AuthMode;
  methods: {
    local: boolean;
    /** managesGlobalRoleはIdPのグループが全体のroleを決めるか。falseならroleは全体管理で変える。 */
    oidc: { label: string; loginUrl: string; managesGlobalRole: boolean } | null;
  };
}
export interface AuthMe {
  user: User;
  mustChangePassword: boolean;
}
export type { TargetCheck, TargetCheckDirectory, TargetCheckDirectorySource, TargetCheckFailureReason, TargetCheckGpu, TargetCheckHost, TargetCheckItem, TargetCheckItemCode, TargetCheckItemName, TargetCheckItemStatus, TargetCheckKind, TargetCheckPython, TargetCheckRequest, TargetCheckResult, TargetCheckResultV2, TargetCheckStatus, TargetCheckWorker, TargetCheckWorkerPresence, TargetDirectoryEntry, TargetDirectoryListing, TargetDirectoryListingOutcome, TargetDirectoryListingRequest, TargetDirectoryListingResult, WorkerSshFiles, WorkerTargetCheck, WorkerTargetCheckClaim, WorkerTargetCheckComplete } from './targetChecks.js';
export { MAX_TARGET_PATH_LENGTH, TARGET_CHECK_KINDS } from './targetChecks.js';
export type {
  SavedView,
  SavedViewColumn,
  SavedViewCreate,
  SavedViewPage,
  SavedViewPatch,
  SavedViewState,
  SavedViewVisibility,
} from './savedViews.js';
export {
  SAVED_VIEW_MAX_COLUMNS,
  SAVED_VIEW_NAME_MAX_LENGTH,
  SAVED_VIEW_STATE_MAX_BYTES,
} from './savedViews.js';
export type {
  OperationsAlert,
  OperationsAlertKind,
  OperationsAlertResolution,
  OperationsAlertState,
  PluginOutboxSummary,
} from './operations.js';
export { OPERATIONS_ALERT_KINDS, OPERATIONS_ALERT_MAX_PAGE_SIZE } from './operations.js';
export { DEFAULT_JOB_ATTEMPTS, MAX_JOB_ATTEMPTS } from './jobAttempts.js';
export type {
  MediaCompareGrid,
  MediaCompareRequest,
  MediaCompareRow,
  MediaTableCell,
  MediaTableColumn,
  MediaTableColumnType,
  MediaTableMediaCell,
  MediaTablePage,
  MediaTableReferenceError,
  RunMedia,
  RunMediaCreate,
  RunMediaCreateItem,
  RunMediaKeySummary,
  RunMediaKind,
  RunMediaList,
  RunMediaPage,
  RunMediaSource,
} from './runMedia.js';
export {
  MEDIA_COMPARE_MAX_RUNS,
  MEDIA_COMPARE_MAX_STEPS,
  MEDIA_TABLE_MAX_BYTES,
  MEDIA_TABLE_PAGE_MAX_ROWS,
  MLFLOW_LOGGED_ARTIFACTS_TAG,
  RUN_MEDIA_CAPTION_MAX_LENGTH,
  RUN_MEDIA_CREATE_MAX_ITEMS,
  RUN_MEDIA_KEY_MAX_LENGTH,
  RUN_MEDIA_METADATA_MAX_BYTES,
} from './runMedia.js';
export type {
  Report,
  ReportBlock,
  ReportBlockSnapshot,
  ReportBlockType,
  ReportChartBlock,
  ReportCreate,
  ReportDetail,
  ReportEmbedBlock,
  ReportEmbedMode,
  ReportMarkdownBlock,
  ReportMediaBlock,
  ReportMediaTableBlock,
  ReportPage,
  ReportParallelCoordinatesBlock,
  ReportParameterImportanceBlock,
  ReportRestore,
  ReportRevision,
  ReportRevisionSummary,
  ReportRunSet,
  ReportRunTableBlock,
  ReportScatterBlock,
  ReportSnapshotData,
  ReportSnapshotList,
  ReportSnapshotRun,
  ReportUpdate,
  ReportUser,
} from './reports.js';
export {
  REPORT_BLOCKS_MAX_BYTES,
  REPORT_MARKDOWN_MAX_LENGTH,
  REPORT_MAX_BLOCKS,
  REPORT_MESSAGE_MAX_LENGTH,
  REPORT_RUN_SET_MAX_RUN_IDS,
  REPORT_RUN_TABLE_MAX_COLUMNS,
  REPORT_RUN_TABLE_MAX_ROWS,
  REPORT_SNAPSHOT_BLOCK_MAX_BYTES,
  REPORT_TITLE_MAX_LENGTH,
} from './reports.js';

export type { ModelVersionTrainingSource, ModelVersionTrainingSourceCreate, HistoricalTrainingRunCreate } from './modelTrainingSources.js';

export type { TrainingDataStage, TrainingDataStageCreate, TrainingDataStagePage } from './trainingDataStages.js';

export { TRAINING_RUN_KINDS, isTrainingRunKind } from './trainingRuns.js';

export type {
  DatasetVersionParentAddition,
  DatasetVersionParentCreate,
  DatasetVersionParentPage,
} from './datasetVersionParents.js';
