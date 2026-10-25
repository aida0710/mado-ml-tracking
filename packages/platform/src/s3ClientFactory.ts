import { S3Client, type S3ClientConfig } from '@aws-sdk/client-s3';
import { createHash } from 'node:crypto';
import { signS3RequestV2 } from './s3SignatureV2.js';
import type { S3BackendConfig, S3ChecksumMode } from './storageBackendConfig.js';

export interface S3Credentials {
  accessKeyId: string;
  secretAccessKey: string;
}
export interface S3ClientSettings {
  config: Pick<
    S3BackendConfig,
    | 'endpoint'
    | 'region'
    | 'bucket'
    | 'pathStyle'
    | 'signatureVersion'
    | 'tlsVerify'
    | 'checksumMode'
  >;
  /** 省略するとSDKの既定のチェーン（インスタンスロール、環境変数、プロファイル）を使う。 */
  credentials?: S3Credentials;
  /** プライベートCAのPEMバンドル。指定すると、Nodeはこのクライアントでこのルートだけを信頼する。 */
  caBundle?: string;
}

// 到達できないエンドポイントでは、リクエストを止めたままにせず、接続テストをすぐ失敗させる。
const S3_CONNECTION_TIMEOUT_MS = 10_000;

/**
 * v4のpayload署名かflexible checksumsに属するヘッダー。v2しか扱えないサービスはそれより古く、
 * リクエストを拒むことがあるので、v2の署名処理の前に取り除く。
 * WHEN_REQUIREDは、S3がチェックサム無しでは拒む操作（DeleteObjects）にだけチェックサムを付ける。
 * その操作の本文はメモリ上のXMLなので、取り除いたチェックサムの代わりにContent-MD5を付ける。
 */
const V4_ONLY_HEADER_PATTERN =
  /^x-amz-(checksum-.+|sdk-checksum-algorithm|content-sha256|decoded-content-length|trailer)$/i;
const V2_HEADER_FILTER_MIDDLEWARE = 's3SignatureV2HeaderFilter';

type SignerConstructor = NonNullable<S3ClientConfig['signerConstructor']>;
type SignerOptions = ConstructorParameters<SignerConstructor>[0];
type RequestSigner = InstanceType<SignerConstructor>;

/**
 * 多くのS3互換サービスは、新しいSDKが全リクエストに付けるCRCチェックサムを拒むので、既定では
 * APIが必須とする操作にだけチェックサムを送る。
 */
function checksumSettings(
  mode: S3ChecksumMode,
): Pick<S3ClientConfig, 'requestChecksumCalculation' | 'responseChecksumValidation'> {
  const setting = mode === 'when_supported' ? 'WHEN_SUPPORTED' : 'WHEN_REQUIRED';
  return { requestChecksumCalculation: setting, responseChecksumValidation: setting };
}

/**
 * SDKは解決済みの認証情報プロバイダーを渡して署名処理を作るので、v2もv4と同じ認証情報を使う。
 * 固定のキーを設定していればそれを、無ければ既定のチェーンを使う。
 */
function signatureV2SignerConstructor({
  bucket,
  pathStyle,
}: Pick<S3BackendConfig, 'bucket' | 'pathStyle'>): SignerConstructor {
  return class S3SignatureV2Signer implements RequestSigner {
    private readonly credentials: SignerOptions['credentials'];
    constructor(options: SignerOptions) {
      this.credentials = options.credentials;
    }
    sign: RequestSigner['sign'] = (request, options) => {
      return signS3RequestV2({
        request,
        credentials: this.credentials,
        bucket,
        pathStyle,
        ...(options?.signingDate ? { signingDate: new Date(options.signingDate) } : {}),
      });
    };
  };
}

function signatureSettings(
  config: S3ClientSettings['config'],
): Pick<S3ClientConfig, 'signerConstructor'> {
  if (config.signatureVersion !== 'v2') return {};
  return { signerConstructor: signatureV2SignerConstructor(config) };
}

export function s3ClientConfig({
  config,
  credentials,
  caBundle,
}: S3ClientSettings): S3ClientConfig {
  return {
    region: config.region,
    ...(config.endpoint ? { endpoint: config.endpoint } : {}),
    forcePathStyle: config.pathStyle,
    ...checksumSettings(config.checksumMode),
    ...signatureSettings(config),
    ...(credentials ? { credentials } : {}),
    requestHandler: {
      connectionTimeout: S3_CONNECTION_TIMEOUT_MS,
      httpsAgent: {
        rejectUnauthorized: config.tlsVerify,
        ...(caBundle ? { ca: caBundle } : {}),
      },
    },
  };
}

export function replaceV4OnlyHeaders(request: {
  headers: Record<string, string>;
  body?: unknown;
}): void {
  const removed = Object.keys(request.headers).filter((name) => V4_ONLY_HEADER_PATTERN.test(name));
  for (const name of removed) delete request.headers[name];
  const hadChecksum = removed.some((name) => /^x-amz-checksum-/i.test(name));
  const hasContentMd5 = Object.keys(request.headers).some(
    (name) => name.toLowerCase() === 'content-md5',
  );
  const body = request.body;
  if (!hadChecksum || hasContentMd5) return;
  if (typeof body !== 'string' && !(body instanceof Uint8Array)) return;
  request.headers['content-md5'] = createHash('md5').update(body).digest('base64');
}

/** チェックサムのmiddlewareがヘッダーを足したあと、署名の直前に動く。 */
function removeV4OnlyHeaders(client: S3Client): void {
  client.middlewareStack.addRelativeTo(
    <Args extends { request: unknown }, Result>(next: (args: Args) => Promise<Result>) =>
      async (args: Args): Promise<Result> => {
        const request = args.request as { headers?: Record<string, string>; body?: unknown };
        if (request.headers) replaceV4OnlyHeaders({ headers: request.headers, body: request.body });
        return next(args);
      },
    {
      name: V2_HEADER_FILTER_MIDDLEWARE,
      relation: 'before',
      toMiddleware: 'httpSigningMiddleware',
    },
  );
}

export function createS3Client(settings: S3ClientSettings): S3Client {
  const client = new S3Client(s3ClientConfig(settings));
  if (settings.config.signatureVersion === 'v2') removeV4OnlyHeaders(client);
  return client;
}
