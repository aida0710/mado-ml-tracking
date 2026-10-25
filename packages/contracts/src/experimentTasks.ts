import type { CodeSource, Job, JsonObject, Run, RunKind } from './index.js';
import type { ExecutionRuntime } from './executionRuntime.js';

export type ExecutionMode = 'run' | 'test';

/** Runの作成時に記録した、変更できない実行の指示。リポジトリへの編集も含む。 */
export interface ExecutionSnapshot {
  codeVersionId: string;
  version: string;
  mode: ExecutionMode;
  source: CodeSource | null;
  runtime: ExecutionRuntime;
  entrypoint: string[];
  requirements: string[];
  environment: Record<string, string>;
}

/** 編集できる起動の既定値。以前のRunは、そのときのrevisionと固定したコードを持ち続ける。 */
export interface ExperimentTask {
  id: string;
  projectId: string;
  experimentId: string;
  name: string;
  description: string;
  kind: RunKind;
  codeVersionId: string;
  modelVersionId: string | null;
  inputDatasetVersionIds: string[];
  parameters: JsonObject;
  tags: Record<string, string>;
  targetId: string | null;
  gpuIds: string[];
  /** siteのJobが求めるGPUの数（siteは数を、ssh・localのコンピュータはgpuIdsを受け取る）。 */
  gpuCount: number;
  /** siteのJobが求める制限時間。nullならsiteのjob shellに任せる。 */
  walltimeSeconds: number | null;
  /** 成功した学習・ファインチューニングのRunの登録先。nullなら登録しない。 */
  outputModel?: TaskOutputModel | null;
  revision: number;
  createdAt: string;
  updatedAt: string;
}

/** modelIdとcreateModelのどちらか一方だけが入る。 */
export interface TaskOutputModel {
  modelId: string | null;
  createModel: { name: string; family: string } | null;
  artifactPath: string;
  versionTemplate?: string;
  defaultCodeVersionId?: string | null;
  metadata?: JsonObject;
}

/** Runの終了後にTaskの側で行った登録の結果。 */
export interface RunOutputRegistration {
  status: 'registered' | 'failed' | 'skipped';
  modelVersionId: string | null;
  error: string | null;
  reason: 'already_registered_by_run' | null;
}

export interface TaskExecution {
  run: Run;
  job: Job;
}

/** 件数に上限のある履歴の1ページ。実行のスナップショットの全体はRunの詳細から読む。 */
export interface TaskRunPage {
  items: Run[];
  nextCursor: string | null;
}

/** 特定のcommitのテキストファイル。省いたパスもリポジトリには残っている。 */
export interface RepositoryFiles {
  commit: string;
  files: Record<string, string>;
  omittedPaths: string[];
}
