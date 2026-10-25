import type { JsonObject } from './index.js';

/**
 * native: SDKが登録した1つのtarのArtifact（log_checkpoint）。manifestにその中身を並べる。
 * mlflow: MLflowがcheckpoints/step-<N>/の下に記録したファイル。1ファイルが1つのArtifact。
 */
export type RunCheckpointSource = 'native' | 'mlflow';

/** checkpointのディレクトリの中のファイル。pathはそのディレクトリからの相対パス。 */
export interface RunCheckpointFile {
  path: string;
  sha256: string;
  size: number;
}

export interface RunCheckpointManifest {
  files: RunCheckpointFile[];
  includesOptimizer: boolean;
  framework: string | null;
}

/** checkpointの保存済みのArtifact。MLflowのcheckpointでは、pathはstep-<N>/からの相対パス。 */
export interface RunCheckpointArtifact {
  id: string;
  path: string;
  size: number;
  sha256: string;
}

export interface RunCheckpoint {
  id: string;
  projectId: string;
  runId: string;
  step: number;
  source: RunCheckpointSource;
  artifactIds: string[];
  artifacts: RunCheckpointArtifact[];
  manifest: RunCheckpointManifest;
  metadata: JsonObject;
  // 新しいcheckpointが保持する数を超えるとfalseになる。それでも再開には使える。
  retained: boolean;
  // 保存済みのArtifactの大きさの合計。
  totalSize: number;
  createdAt: string;
}

export interface RunCheckpointPage {
  items: RunCheckpoint[];
}

/** POST /projects/:p/runs/:r/checkpoints。artifactIdは同じRunの保存済みのtarのArtifact。 */
export interface RunCheckpointCreate {
  step: number;
  artifactId: string;
  manifest: {
    files: RunCheckpointFile[];
    includesOptimizer?: boolean;
    framework?: string | null;
  };
  metadata?: JsonObject;
}

/** POST /projects/:p/jobs/:j/retryの本文。両方を省くと、新しいRunを最初から始める。 */
export interface JobRetryRequest {
  checkpointId?: string;
  // 再試行するRunのcheckpointのうち、stepが最も大きいものを選ぶ。
  resumeFromLatestCheckpoint?: boolean;
}

/** Run.environment.resume。Runをcheckpointに固定したときにサーバーが書く。 */
export interface RunResumeCheckpointRecord {
  checkpointId: string;
  sourceRunId: string;
  step: number;
}

/** WorkerJob.resumeCheckpoint: workerがダウンロードして検証し、読み取り専用でマウントするもの。 */
export interface WorkerResumeCheckpoint {
  id: string;
  runId: string;
  step: number;
  source: RunCheckpointSource;
  artifacts: RunCheckpointArtifact[];
  manifest: RunCheckpointManifest;
  metadata: JsonObject;
}

// MMT_CHECKPOINT_KEEP_COUNTの既定値。Runごとに保持するcheckpointの数。
export const DEFAULT_CHECKPOINT_KEEP_COUNT = 5;
// この接頭辞（checkpoints/step-<N>/...）の下のMLflowのArtifactは、自動でcheckpointになる。
export const MLFLOW_CHECKPOINT_PATH_PREFIX = 'checkpoints/step-';
