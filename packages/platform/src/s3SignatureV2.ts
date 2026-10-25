import { createHmac } from 'node:crypto';

/**
 * S3用のAWS Signature Version 2（HMAC-SHA1）。AWS SDK v3はv4でしか署名しないので、ここで実装する。
 * S3互換サービスには、今もv2しか受け付けないものがある（decisions.md）。
 * 仕様: https://docs.aws.amazon.com/AmazonS3/latest/userguide/RESTAuthentication.html
 */

/** v2が署名するリクエストの部分。構造は@smithyのHttpRequestと同じ。 */
export interface S3SignableRequest {
  method: string;
  hostname: string;
  /** 送るとおりのURIエンコード済みのパス。v2はそれをそのまま署名する。 */
  path: string;
  /** デコード済みのクエリの値。nullか""は、"="の無い名前を表す。 */
  query?: Record<string, string | string[] | null>;
  headers: Record<string, string>;
}

export interface S3SignatureV2Credentials {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string;
}

/**
 * CanonicalizedResourceに含めるクエリパラメータ。AWSの一覧（acl ... website、delete、
 * response-*）に、botocoreのHmacV1Authが署名する新しいsubresourceを足したもの。これで、
 * taggingやrestoreのリクエストも、それを実装したサービスで検証が通る。
 */
const SIGNED_SUBRESOURCES = new Set([
  'accelerate',
  'acl',
  'analytics',
  'cors',
  'delete',
  'inventory',
  'lifecycle',
  'location',
  'logging',
  'metrics',
  'notification',
  'object-lock',
  'partNumber',
  'policy',
  'replication',
  'requestPayment',
  'response-cache-control',
  'response-content-disposition',
  'response-content-encoding',
  'response-content-language',
  'response-content-type',
  'response-expires',
  'restore',
  'select',
  'select-type',
  'tagging',
  'torrent',
  'uploadId',
  'uploads',
  'versionId',
  'versioning',
  'versions',
  'website',
]);

const AMZ_HEADER_PREFIX = 'x-amz-';
export const S3_V2_AUTHORIZATION_PREFIX = 'AWS ';

function headerValue(headers: Record<string, string>, name: string): string {
  const values = Object.entries(headers)
    .filter(([key]) => key.toLowerCase() === name)
    .map(([, value]) => value.trim());
  return values.join(',');
}

/** 仕様どおり、折り返したヘッダーの行を1つの空白に「展開（unfold）」する。 */
function unfold(value: string): string {
  return value.replace(/\s*\r?\n\s*/g, ' ').trim();
}

export function canonicalizedAmzHeaders(headers: Record<string, string>): string {
  const combined = new Map<string, string[]>();
  for (const [name, value] of Object.entries(headers)) {
    const lowerName = name.toLowerCase();
    if (!lowerName.startsWith(AMZ_HEADER_PREFIX)) continue;
    combined.set(lowerName, [...(combined.get(lowerName) ?? []), unfold(value)]);
  }
  return [...combined.keys()]
    .sort()
    .map((name) => `${name}:${combined.get(name)!.join(',')}\n`)
    .join('');
}

/** subresourceの値はデコードした形で、名前順に並べて署名する。 */
function canonicalizedSubresources(query: S3SignableRequest['query'] = {}): string {
  const pairs = Object.keys(query)
    .filter((name) => SIGNED_SUBRESOURCES.has(name))
    .sort()
    .flatMap((name) => {
      const value = query[name];
      const values = Array.isArray(value) ? value : [value];
      return values.map((item) => (item === null || item === '' ? name : `${name}=${item}`));
    });
  return pairs.length > 0 ? `?${pairs.join('&')}` : '';
}

/**
 * `hostBucket`はHostヘッダーが指すbucket（virtual-hosted styleかCNAME）。path-styleの
 * リクエストでは、bucketは既にパスの最初の要素になっている。
 */
export function canonicalizedResource(
  request: Pick<S3SignableRequest, 'path' | 'query'>,
  hostBucket?: string,
): string {
  const bucketPart = hostBucket ? `/${hostBucket}` : '';
  return `${bucketPart}${request.path || '/'}${canonicalizedSubresources(request.query)}`;
}

/** x-amz-dateがあるとS3はDateを無視するので、Dateの位置は""として署名する。 */
export function stringToSign(request: S3SignableRequest, hostBucket?: string): string {
  const { headers } = request;
  const date = headerValue(headers, 'x-amz-date') ? '' : headerValue(headers, 'date');
  return [
    request.method.toUpperCase(),
    headerValue(headers, 'content-md5'),
    headerValue(headers, 'content-type'),
    date,
    `${canonicalizedAmzHeaders(headers)}${canonicalizedResource(request, hostBucket)}`,
  ].join('\n');
}

export function signatureV2Authorization({
  request,
  credentials,
  hostBucket,
}: {
  request: S3SignableRequest;
  credentials: S3SignatureV2Credentials;
  hostBucket?: string;
}): string {
  const signature = createHmac('sha1', credentials.secretAccessKey)
    .update(stringToSign(request, hostBucket), 'utf8')
    .digest('base64');
  return `${S3_V2_AUTHORIZATION_PREFIX}${credentials.accessKeyId}:${signature}`;
}

/**
 * virtual-hostedのリクエストがHostで指すbucketを探す。SDKがpath-styleで送るリクエスト
 * （forcePathStyle、またはDNSで使えないbucket名）では、ホストはエンドポイントのまま。
 */
export function hostBucketOf({
  hostname,
  bucket,
  pathStyle,
}: {
  hostname: string;
  bucket: string;
  pathStyle: boolean;
}): string | undefined {
  if (pathStyle) return undefined;
  return hostname === bucket || hostname.startsWith(`${bucket}.`) ? bucket : undefined;
}

/** HTTP-date（RFC 7231のIMF-fixdate）。どのS3の実装でも解釈できる。 */
function httpDate(date: Date): string {
  return date.toUTCString();
}

type CredentialSource = S3SignatureV2Credentials | (() => Promise<S3SignatureV2Credentials>);

/**
 * リクエストの写しにDate、x-amz-security-token（一時的な認証情報）、Authorizationを足す。
 * 前の試行のAuthorizationとDateは置き換えるので、SDKが再試行しても正しく署名し直せる。
 */
export async function signS3RequestV2<Request extends S3SignableRequest>({
  request,
  credentials,
  bucket,
  pathStyle,
  signingDate = new Date(),
}: {
  request: Request;
  credentials: CredentialSource;
  bucket: string;
  pathStyle: boolean;
  signingDate?: Date;
}): Promise<Request> {
  const identity = typeof credentials === 'function' ? await credentials() : credentials;
  const headers = Object.fromEntries(
    Object.entries(request.headers).filter(
      ([name]) => !['authorization', 'date', 'x-amz-security-token'].includes(name.toLowerCase()),
    ),
  );
  headers.date = httpDate(signingDate);
  if (identity.sessionToken) headers['x-amz-security-token'] = identity.sessionToken;
  const signed: Request = Object.assign(
    Object.create(Object.getPrototypeOf(request) as object) as Request,
    request,
    { headers },
  );
  headers.authorization = signatureV2Authorization({
    request: signed,
    credentials: identity,
    hostBucket: hostBucketOf({ hostname: request.hostname, bucket, pathStyle }),
  });
  return signed;
}
