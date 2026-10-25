import type { ArtifactBackend } from './index.js';

/**
 * open: partを受け付ける。verifying: completeが要求され、サーバーがオブジェクトを組み立てて
 * ハッシュを計算している。completed: `artifactId`のArtifactがある。aborted・expired・failedは
 * 終了状態で、保存したバイト列を残さない。
 */
export type ArtifactUploadStatus =
  'open' | 'verifying' | 'completed' | 'aborted' | 'expired' | 'failed';

/** 1つのArtifactの、再開できるアップロードセッション。partには1からpartCountまで番号を振る。 */
export interface ArtifactUpload {
  id: string;
  projectId: string;
  runId: string | null;
  path: string;
  backend: ArtifactBackend;
  mimeType: string;
  expectedSize: number;
  expectedSha256: string | null;
  /** 最後以外のpartはちょうどこの大きさ。最後のpartには残りが入る。 */
  partSize: number;
  partCount: number;
  status: ArtifactUploadStatus;
  /** 完了後に登録したArtifact。そのidはアップロードのidと同じ。 */
  artifactId: string | null;
  /** statusがfailedのときの失敗のコード。たとえば`sha256_mismatch`。 */
  error: string | null;
  expiresAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface ArtifactUploadPart {
  partNumber: number;
  size: number;
  sha256: string;
  receivedAt: string;
}

/**
 * 1つのアップロードセッションのGET。再開するクライアントは、受け取り済みのpartを見て
 * どのpartを送り直すかを決める。
 */
export interface ArtifactUploadDetail extends ArtifactUpload {
  receivedParts: ArtifactUploadPart[];
}

/**
 * アップロードセッションの一覧の1行。保存済みの量を示し、クライアントが続きからの
 * アップロードを勧められるようにする。
 */
export interface ArtifactUploadListItem extends ArtifactUpload {
  /** 受け取ったpartの大きさの合計。 */
  receivedBytes: number;
}

export interface ArtifactUploadCreate {
  path: string;
  runId?: string;
  mimeType?: string;
  expectedSize: number;
  expectedSha256?: string;
  partSize?: number;
}
