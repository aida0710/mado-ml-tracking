import type { Readable } from 'node:stream';
import type { ArtifactBackend } from '@mmt/contracts';

export interface ArtifactWrite {
  backend: ArtifactBackend;
  key: string;
  body: Readable;
  mimeType: string;
}
export interface ArtifactRead {
  backend: ArtifactBackend;
  key: string;
  range?: string;
}
export interface StoredArtifact {
  size: number;
  sha256: string;
}
export interface ArtifactContent {
  body: Readable;
  size: number;
  totalSize: number;
  status: 200 | 206;
  contentRange?: string;
}
/**
 * 保存先での1つのマルチパートアップロード。最終的なストレージのキーと、保存先のupload idで
 * 識別する。
 */
export interface MultipartUploadReference {
  key: string;
  backendUploadId: string;
}
export interface MultipartPartWrite extends MultipartUploadReference {
  partNumber: number;
  body: Readable;
  /** パートはちょうどこのバイト数でなければならない（リクエストのContent-Length）。 */
  size: number;
  /** クライアントがこのパートについて宣言した、小文字16進のSHA-256（送ってきたとき）。 */
  sha256?: string;
}
export interface StoredMultipartPart {
  size: number;
  sha256: string;
  /** アップロードの完了時に、このパートのバイト列を指す保存先の識別子。 */
  etag: string;
}
export interface MultipartCompletion extends MultipartUploadReference {
  /** オブジェクトのすべてのパート。ストアはパート番号の昇順に組み立てる。 */
  parts: { partNumber: number; size: number; etag: string }[];
}
export interface IncompleteMultipartUpload extends MultipartUploadReference {
  initiatedAt: Date;
}
/**
 * 再開できるアップロード。パートは別々に保存し、完了時に最終的なキーに組み立てる。完了では
 * オブジェクトのハッシュを取らない。呼び出し側が一度読み戻してファイル全体を検証する。
 */
export interface ArtifactMultipartStore {
  createMultipart(target: { key: string; mimeType: string }): Promise<{ backendUploadId: string }>;
  putPart(part: MultipartPartWrite): Promise<StoredMultipartPart>;
  completeMultipart(completion: MultipartCompletion): Promise<void>;
  /** 保存したパートを捨てる。知らないアップロードや既に中止したアップロードの中止は成功にする。 */
  abortMultipart(upload: MultipartUploadReference): Promise<void>;
  listIncompleteUploads(): Promise<IncompleteMultipartUpload[]>;
  /** 中断した書き込みの一時ファイルのうち、指定の時刻以降に変更されていないものを消す。 */
  removeAbandonedStaging(notModifiedSince: Date): Promise<number>;
}
export interface ArtifactStore {
  put(write: Omit<ArtifactWrite, 'backend'>): Promise<StoredArtifact>;
  read(read: Omit<ArtifactRead, 'backend'>): Promise<ArtifactContent>;
  remove(key: string): Promise<void>;
  /** 任意。これが無いストアは、1回のリクエストでのアップロードだけを受け付ける。 */
  multipart?: ArtifactMultipartStore;
}
export interface ArtifactStores {
  backends(): ArtifactBackend[];
  put(write: ArtifactWrite): Promise<StoredArtifact>;
  read(read: ArtifactRead): Promise<ArtifactContent>;
  remove(reference: { backend: ArtifactBackend; key: string }): Promise<void>;
  /** 保存先は設定されているが、再開できるアップロードを受けられないときはnullを返す。 */
  multipart(backend: ArtifactBackend): ArtifactMultipartStore | null;
}
export class ArtifactNotFoundError extends Error {
  constructor() {
    super('Artifact does not exist');
    this.name = 'ArtifactNotFoundError';
  }
}
export class ArtifactRangeError extends Error {
  constructor(readonly totalSize: number) {
    super('Requested byte range is not satisfiable');
    this.name = 'ArtifactRangeError';
  }
}
export class ArtifactBackendError extends Error {
  constructor() {
    super('Artifact backend is not configured');
    this.name = 'ArtifactBackendError';
  }
}
