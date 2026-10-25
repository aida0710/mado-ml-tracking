import path from 'node:path';
import { containsControlCharacter } from '@mmt/contracts';
import { MULTIPART_MIN_PART_BYTES } from './artifactMultipart.js';

export type StorageBackendKind = 'filesystem' | 's3';
export type S3SignatureVersion = 'v4' | 'v2';
export type S3ChecksumMode = 'when_required' | 'when_supported';

export interface FilesystemBackendConfig {
  kind: 'filesystem';
  rootPath: string;
}
export interface S3BackendConfig {
  kind: 's3';
  /** 省略するとregionのAWSのエンドポイントを使う。 */
  endpoint?: string;
  region: string;
  bucket: string;
  /** 先頭と末尾のスラッシュを除いた形に正規化する。空ならbucketの直下。 */
  prefix: string;
  pathStyle: boolean;
  signatureVersion: S3SignatureVersion;
  tlsVerify: boolean;
  checksumMode: S3ChecksumMode;
  multipartPartSizeBytes: number;
  /**
   * falseにすると、すべてのArtifactを1回のPutObjectで保存する。multipartのAPIが動かない
   * S3互換サービス向け。
   */
  multipartEnabled: boolean;
}
export type StorageBackendConfig = FilesystemBackendConfig | S3BackendConfig;

/** 呼び出し側がリクエストの本文をそのまま渡せるよう、すべて省略可能。既定値は正規化で埋める。 */
export interface StorageBackendConfigInput {
  kind: StorageBackendKind;
  rootPath?: string;
  endpoint?: string | null;
  region?: string;
  bucket?: string;
  prefix?: string;
  pathStyle?: boolean;
  signatureVersion?: S3SignatureVersion;
  tlsVerify?: boolean;
  checksumMode?: S3ChecksumMode;
  multipartPartSizeBytes?: number;
  multipartEnabled?: boolean;
}

// ストリーミングのアップロード1つごとにこの大きさのパートを2つバッファに持つので、
// 既定値ならメモリは16MiBまでに収まる。
export const DEFAULT_MULTIPART_PART_SIZE_BYTES = 8 * 1024 * 1024;
// put()は同時に2つのパートをメモリに持つ。512MiBのパートでも、アップロード1つで1GiBを使う。
export const MAX_MULTIPART_PART_SIZE_BYTES = 512 * 1024 * 1024;
// S3互換のエンドポイントがregionを無視する場合でも、AWS SDKは署名に何らかのregionを必要とする。
export const DEFAULT_S3_REGION = 'us-east-1';
// AWSは1024バイトを超えるオブジェクトキーのprefixを拒む。prefixの後ろにArtifactのキーが入る
// 余地を残す。
const MAX_S3_PREFIX_LENGTH = 512;
// 保存先の名前はartifacts.backendとprojects.artifact_backendに保存するので、短く保つ。
const STORAGE_BACKEND_NAME_PATTERN = /^[a-z0-9][a-z0-9-]{0,62}$/;
// S3のbucket名の規則。小文字の英字、数字、ドット、ハイフンで3〜63文字。
const S3_BUCKET_NAME_PATTERN = /^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/;
const S3_REGION_PATTERN = /^[a-z0-9-]{1,64}$/;
const S3_PREFIX_SEGMENT_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

export type StorageBackendConfigErrorCode =
  | 'invalid_storage_backend_name'
  | 'invalid_storage_backend_config';

export class StorageBackendConfigError extends Error {
  constructor(
    readonly code: StorageBackendConfigErrorCode,
    /** 問題のあるフィールドの名前。表示しても安全で、値はメッセージに含めない。 */
    readonly field: string,
  ) {
    super(`Invalid storage backend setting: ${field}`);
    this.name = 'StorageBackendConfigError';
  }
}

export function isValidStorageBackendName(name: string): boolean {
  return STORAGE_BACKEND_NAME_PATTERN.test(name);
}

function invalid(field: string): never {
  throw new StorageBackendConfigError('invalid_storage_backend_config', field);
}

function normalizeRootPath(rootPath: string | undefined): string {
  if (!rootPath || !path.isAbsolute(rootPath) || containsControlCharacter(rootPath))
    invalid('rootPath');
  // ..を含むパスでは、Artifactが実際にどこへ置かれるのかが分からなくなる。
  if (rootPath.split(/[\\/]/).includes('..')) invalid('rootPath');
  return path.normalize(rootPath);
}

function normalizeEndpoint(endpoint: string | null | undefined): string | undefined {
  if (!endpoint) return undefined;
  if (!URL.canParse(endpoint)) invalid('endpoint');
  const url = new URL(endpoint);
  if (!['http:', 'https:'].includes(url.protocol)) invalid('endpoint');
  // 認証情報は暗号化したsecretに置く。管理者に表示されるURLには決して入れない。
  if (url.username || url.password || url.search || url.hash) invalid('endpoint');
  return url.toString().replace(/\/$/, '');
}

/** "a/b"、"/a/b/"、""を受け付け、"a/b"の形で返す。各要素はArtifactのキーの規則に従う。 */
export function normalizeS3Prefix(prefix: string | undefined): string {
  const segments = (prefix ?? '').split('/').filter(Boolean);
  if (!segments.every((segment) => S3_PREFIX_SEGMENT_PATTERN.test(segment))) invalid('prefix');
  const normalized = segments.join('/');
  if (normalized.length > MAX_S3_PREFIX_LENGTH) invalid('prefix');
  return normalized;
}

function normalizePartSize(size: number | undefined): number {
  const partSize = size ?? DEFAULT_MULTIPART_PART_SIZE_BYTES;
  if (
    !Number.isSafeInteger(partSize) ||
    partSize < MULTIPART_MIN_PART_BYTES ||
    partSize > MAX_MULTIPART_PART_SIZE_BYTES
  )
    invalid('multipartPartSizeBytes');
  return partSize;
}

/**
 * 署名v2はpayloadのチェックサムを署名せず、SDKのWHEN_SUPPORTEDのチェックサムは、v2専用の
 * サービスが解釈できないaws-chunkedのtrailerで届く。そのため、v2ではWHEN_REQUIREDだけを
 * 受け付ける。v2でもregionは残す。SDKがregionからAWSのエンドポイントを決めるためで、署名には
 * 使わない。
 */
function normalizeChecksumMode(
  checksumMode: S3ChecksumMode | undefined,
  signatureVersion: S3SignatureVersion,
): S3ChecksumMode {
  const mode = checksumMode ?? 'when_required';
  if (!['when_required', 'when_supported'].includes(mode)) invalid('checksumMode');
  if (signatureVersion === 'v2' && mode !== 'when_required') invalid('checksumMode');
  return mode;
}

/** 管理者が入力した保存先の設定を検証し、既定値を埋める。 */
export function normalizeStorageBackendConfig(
  input: StorageBackendConfigInput,
): StorageBackendConfig {
  if (input.kind === 'filesystem')
    return { kind: 'filesystem', rootPath: normalizeRootPath(input.rootPath) };
  if (input.kind !== 's3') invalid('kind');
  const signatureVersion = input.signatureVersion ?? 'v4';
  if (!['v4', 'v2'].includes(signatureVersion)) invalid('signatureVersion');
  if (!input.bucket || !S3_BUCKET_NAME_PATTERN.test(input.bucket)) invalid('bucket');
  const region = input.region || DEFAULT_S3_REGION;
  if (!S3_REGION_PATTERN.test(region)) invalid('region');
  const checksumMode = normalizeChecksumMode(input.checksumMode, signatureVersion);
  if (input.multipartEnabled !== undefined && typeof input.multipartEnabled !== 'boolean')
    invalid('multipartEnabled');
  const endpoint = normalizeEndpoint(input.endpoint);
  return {
    kind: 's3',
    ...(endpoint ? { endpoint } : {}),
    region,
    bucket: input.bucket,
    prefix: normalizeS3Prefix(input.prefix),
    pathStyle: input.pathStyle ?? false,
    signatureVersion,
    tlsVerify: input.tlsVerify ?? true,
    checksumMode,
    multipartPartSizeBytes: normalizePartSize(input.multipartPartSizeBytes),
    multipartEnabled: input.multipartEnabled ?? true,
  };
}

/**
 * 既存のオブジェクトの置き場所を決めるフィールド。Artifactがこの保存先を指している間に変えると、
 * それらのArtifactが読めなくなる。
 */
export function storageLocationChanged(
  current: StorageBackendConfig,
  next: StorageBackendConfig,
): boolean {
  if (current.kind !== next.kind) return true;
  if (current.kind === 'filesystem' && next.kind === 'filesystem')
    return current.rootPath !== next.rootPath;
  if (current.kind === 's3' && next.kind === 's3')
    return (
      current.bucket !== next.bucket ||
      current.endpoint !== next.endpoint ||
      current.prefix !== next.prefix
    );
  return true;
}
