import type { JsonObject, LogEntry, MetricPoint, RunKind } from './index.js';

/**
 * オフライン同期: クライアントはAPIに届かない場所でRunを記録し、あとで送る。RunのIDと各バッチの
 * IDはクライアントが決めるので、失敗のあとに送り直しても重複しない。
 */

/** PUT /projects/:p/sync/runs/:runId。そのIDでRunを作るか、既にあるRunを返す。 */
export interface SyncRunCreate {
  experimentId: string;
  name: string;
  kind: RunKind;
  parameters?: JsonObject;
  tags?: Record<string, string>;
  parentRunId?: string | null;
  // クライアントがRunを始めた日時。SYNC_CLOCK_SKEW_SECONDSまでの未来は受け付ける。
  startedAt: string;
  // Runを記録したマシンのラベル。Run.syncOriginとして保存する。
  origin?: string | null;
}

export type SyncTerminalStatus = 'finished' | 'failed' | 'canceled';

export interface SyncBatchStatus {
  status: SyncTerminalStatus;
  endedAt: string;
  error?: string | null;
}

/** POST /projects/:p/sync/runs/:runId/batches。既に受け取ったbatchIdはもう一度適用しない。 */
export interface SyncBatch {
  batchId: string;
  // クライアント側でのバッチの順番。診断のために保存し、抜けは拒否も補完もしない。
  sequence: number;
  metrics?: MetricPoint[];
  params?: JsonObject;
  tags?: Record<string, string>;
  logs?: LogEntry[];
  status?: SyncBatchStatus;
}

export interface SyncBatchCounts {
  metrics: number;
  params: number;
  tags: number;
  logs: number;
}

/** duplicate=trueはbatchIdが既に適用済みだったこと。countsは最初に適用したときのもの。 */
export interface SyncBatchResult {
  applied: boolean;
  duplicate: boolean;
  counts: SyncBatchCounts;
}

export interface ArtifactPresenceItem {
  path: string;
  sha256: string;
  size: number;
}

/** POST /projects/:p/sync/runs/:runId/artifacts/check */
export interface ArtifactPresenceCheck {
  items: ArtifactPresenceItem[];
}

/** Runの保存済みのArtifactとsha256・サイズが同じパス。残りはアップロードが要る。 */
export interface ArtifactPresence {
  present: string[];
}

export const SYNC_CLOCK_SKEW_SECONDS = 300;
export const SYNC_BATCH_MAX_METRICS = 10000;
export const SYNC_BATCH_MAX_LOGS = 10000;
export const SYNC_ARTIFACT_CHECK_MAX_ITEMS = 1000;
export const SYNC_ORIGIN_MAX_LENGTH = 200;
