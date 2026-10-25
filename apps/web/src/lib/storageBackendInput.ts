import type {
  StorageBackend,
  StorageBackendCreate,
  StorageBackendKind,
  StorageBackendPatch,
} from '@mmt/contracts';
import type { FormValues } from '../types/form';
import { getFieldValue } from './formValues';
import { LocalizedError } from './localizedError';
import { text, textTemplates } from '../i18n/catalog';

const MIB = 1024 * 1024;
// S3は5 MiB未満のpartを拒否する（最後のpartを除く）。APIはアップロード1つにつきpartを2つ
// メモリに置くので、partの上限を512 MiBにしている（storageBackendConfig.tsの
// MAX_MULTIPART_PART_SIZE_BYTES）。
export const MIN_MULTIPART_PART_SIZE_MIB = 5;
export const MAX_MULTIPART_PART_SIZE_MIB = 512;
// APIのDEFAULT_MULTIPART_PART_SIZE_BYTESと同じ。大きさを指定せず保存した保存先と合わせる。
export const DEFAULT_MULTIPART_PART_SIZE_MIB = 8;
// S3の既定のリージョン。S3互換のサーバーの多くもこれを受け付ける。
export const DEFAULT_S3_REGION = 'us-east-1';

// 保存先の名前はArtifactごとに記録されるので、APIは短く、URLにそのまま使える形に限っている。
const BACKEND_NAME_PATTERN = /^[a-z0-9][a-z0-9-]{0,62}$/;
// S3のbucketの命名規則（汎用バケット）。
const BUCKET_NAME_PATTERN = /^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/;
const IPV4_PATTERN = /^\d{1,3}(\.\d{1,3}){3}$/;
// APIはCAバンドルをPEMの証明書でだけ受け付ける。
export const PEM_CERTIFICATE_HEADER = '-----BEGIN CERTIFICATE-----';

/** 新しい保存先のフォームの値。 */
export function createStorageBackendValues(): FormValues {
  return {
    name: '',
    kind: 's3',
    rootPath: '',
    endpoint: '',
    region: DEFAULT_S3_REGION,
    bucket: '',
    prefix: '',
    pathStyle: 'false',
    signatureVersion: 'v4',
    tlsVerify: 'true',
    caBundle: '',
    clearCaBundle: 'false',
    checksumMode: 'when_required',
    multipartEnabled: 'true',
    multipartPartSizeMib: String(DEFAULT_MULTIPART_PART_SIZE_MIB),
    accessKeyId: '',
    secretAccessKey: '',
    enabled: 'true',
  };
}

/** 保存済みの保存先を編集するフォームの値。書き込み専用の値（secret、CA）は空から始める。 */
export function updateStorageBackendValues(backend: StorageBackend): FormValues {
  return {
    ...createStorageBackendValues(),
    name: backend.name,
    kind: backend.kind,
    rootPath: backend.rootPath ?? '',
    endpoint: backend.endpoint ?? '',
    region: backend.region ?? DEFAULT_S3_REGION,
    bucket: backend.bucket ?? '',
    prefix: backend.prefix ?? '',
    pathStyle: String(backend.pathStyle ?? false),
    signatureVersion: backend.signatureVersion,
    tlsVerify: String(backend.tlsVerify),
    checksumMode: backend.checksumMode,
    multipartEnabled: String(backend.multipartEnabled),
    multipartPartSizeMib: String(Math.round(backend.multipartPartSizeBytes / MIB)),
    accessKeyId: backend.accessKeyId ?? '',
    enabled: String(backend.enabled),
  };
}

type BackendSettings = Omit<StorageBackendCreate, 'name' | 'kind' | 'caBundle' | 'secretAccessKey'>;

/** POST /admin/storage-backendsの本文を作る。値が不正なら、画面に出す文で例外を投げる。 */
export function buildStorageBackendCreate(values: FormValues): StorageBackendCreate {
  const name = getFieldValue(values, 'name').trim();
  if (!BACKEND_NAME_PATTERN.test(name)) throw new Error(text.storageNameError);
  const kind = getKind(values);
  if (kind === 'filesystem') return { name, kind, ...buildFilesystemSettings(values) };
  const caBundle = getCaBundle(values);
  const secretAccessKey = getFieldValue(values, 'secretAccessKey');
  const settings = omitUnset(buildS3Settings(values));
  if (settings.accessKeyId && !secretAccessKey) throw new Error(text.storageSecretRequired);
  return {
    name,
    kind,
    ...settings,
    ...(caBundle ? { caBundle } : {}),
    ...(secretAccessKey ? { secretAccessKey } : {}),
  };
}

/**
 * PATCH /admin/storage-backends/:nameの本文を作る。空にしたendpointとaccess key idはnullで
 * 送り（空にしたprefixは''で送り）、保存済みの値を消す。access key idを消すとsecretも一緒に
 * 消える。secretとCAの欄が空のときは、逆に保存済みの値をそのまま残す。APIはこれらを返さない
 * ので、フォームに出して送り返すことができないため。
 */
export function buildStorageBackendPatch(
  values: FormValues,
  backend: StorageBackend,
): StorageBackendPatch {
  if (backend.kind === 'filesystem') return buildFilesystemSettings(values);
  const settings = buildS3Settings(values);
  const caBundle = getCaBundle(values);
  const secretAccessKey = getFieldValue(values, 'secretAccessKey');
  if (settings.accessKeyId && !secretAccessKey && !backend.secretConfigured)
    throw new Error(text.storageSecretRequired);
  const patch: StorageBackendPatch = { ...settings };
  if (caBundle) patch.caBundle = caBundle;
  else if (getFieldValue(values, 'clearCaBundle') === 'true') patch.caBundle = null;
  if (secretAccessKey && settings.accessKeyId) patch.secretAccessKey = secretAccessKey;
  return patch;
}

function getSignatureVersion(values: FormValues): StorageBackend['signatureVersion'] {
  return getFieldValue(values, 'signatureVersion') === 'v2' ? 'v2' : 'v4';
}

export function isSignatureV2(values: FormValues): boolean {
  return getSignatureVersion(values) === 'v2';
}

function getKind(values: FormValues): StorageBackendKind {
  return getFieldValue(values, 'kind') === 'filesystem' ? 'filesystem' : 's3';
}

function buildFilesystemSettings(values: FormValues): BackendSettings {
  const rootPath = getFieldValue(values, 'rootPath').trim();
  if (!rootPath.startsWith('/')) throw new Error(text.storageRootPathError);
  return { rootPath, enabled: isChecked(values, 'enabled') };
}

function buildS3Settings(values: FormValues): BackendSettings {
  const endpoint = getFieldValue(values, 'endpoint').trim();
  if (endpoint && !isHttpUrl(endpoint)) throw new Error(text.storageEndpointError);
  const bucket = getFieldValue(values, 'bucket').trim();
  if (!isValidBucketName(bucket)) throw new Error(text.storageBucketError);
  const region = getFieldValue(values, 'region').trim();
  if (!region) throw new Error(text.required);
  const accessKeyId = getFieldValue(values, 'accessKeyId').trim();
  const prefix = normalizePrefix(getFieldValue(values, 'prefix'));
  return {
    endpoint: endpoint || null,
    region,
    bucket,
    prefix,
    pathStyle: isChecked(values, 'pathStyle'),
    signatureVersion: getSignatureVersion(values),
    tlsVerify: isChecked(values, 'tlsVerify'),
    // APIはv2の保存先をWHEN_REQUIREDでだけ保存するので、v2では選択肢を隠してこの値を送る。
    checksumMode: isSignatureV2(values)
      ? 'when_required'
      : (getFieldValue(values, 'checksumMode') as StorageBackend['checksumMode']),
    multipartEnabled: isChecked(values, 'multipartEnabled'),
    multipartPartSizeBytes: parsePartSizeMib(getFieldValue(values, 'multipartPartSizeMib')) * MIB,
    accessKeyId: accessKeyId || null,
    enabled: isChecked(values, 'enabled'),
  };
}

/** 新しい保存先には消す値が無いので、空のままの任意の値は送らない。 */
function omitUnset(settings: BackendSettings): BackendSettings {
  return Object.fromEntries(
    Object.entries(settings).filter(([, value]) => value !== '' && value !== null),
  ) as BackendSettings;
}

function getCaBundle(values: FormValues): string {
  const caBundle = getFieldValue(values, 'caBundle').trim();
  if (caBundle && !caBundle.includes(PEM_CERTIFICATE_HEADER))
    throw new Error(text.storageCaBundleError);
  return caBundle;
}

function isChecked(values: FormValues, name: string): boolean {
  return getFieldValue(values, name) === 'true';
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

function isValidBucketName(bucket: string): boolean {
  return BUCKET_NAME_PATTERN.test(bucket) && !bucket.includes('..') && !IPV4_PATTERN.test(bucket);
}

/** キーは`<prefix>/<key>`の形でつなぐので、前後にスラッシュがあると空のパス要素ができてしまう。 */
function normalizePrefix(prefix: string): string {
  return prefix.trim().replace(/^\/+|\/+$/g, '');
}

function parsePartSizeMib(value: string): number {
  const mib = Number(value);
  if (
    !Number.isSafeInteger(mib) ||
    mib < MIN_MULTIPART_PART_SIZE_MIB ||
    mib > MAX_MULTIPART_PART_SIZE_MIB
  )
    throw new LocalizedError(() =>
      textTemplates.storagePartSizeError(MIN_MULTIPART_PART_SIZE_MIB, MAX_MULTIPART_PART_SIZE_MIB),
    );
  return mib;
}
