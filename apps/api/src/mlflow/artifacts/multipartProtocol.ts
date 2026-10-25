import { z } from 'zod';
import { MULTIPART_MAX_PART_COUNT } from '@mmt/platform';
import { DomainError } from '../../domain/errors.js';
import { uuidSchema } from '../../domain/validation.js';
import { parseArtifactLocation, validateArtifactPath } from './artifactPath.js';
import type { ArtifactLocation } from './artifactTypes.js';

export const MULTIPART_UPLOAD_ROOT = '/api/2.0/mlflow-artifacts/mpu';
/**
 * MLflowの_upload_partはcredential.headersだけを送り、Authorizationは送らないので、sessionの
 * part tokenはこのヘッダーで運ぶ。
 */
export const PART_TOKEN_HEADER = 'X-MMT-Upload-Token';
export const MULTIPART_PART_ROUTE = `${MULTIPART_UPLOAD_ROOT}/parts/:uploadId/:partNumber`;

export type MultipartAction = 'create' | 'complete' | 'abort';

// MLflowはクライアントのローカルのファイルパスを送る。Artifactのパスに入るのはそのファイル名だけ。
const localPathSchema = z.string().min(1).max(4096);
// Protobuf JSONは0のnum_partsを省くことがあり、空のファイルではそうなる。
export const createMultipartRequestSchema = z.object({
  path: localPathSchema,
  num_parts: z.coerce.number().int().min(0).max(MULTIPART_MAX_PART_COUNT).default(0),
});
export const completeMultipartRequestSchema = z.object({
  path: localPathSchema,
  upload_id: uuidSchema,
  parts: z
    .array(
      z.object({
        part_number: z.coerce.number().int().min(1).max(MULTIPART_MAX_PART_COUNT),
        etag: z.string().max(200).nullish(),
        url: z.string().nullish(),
      }),
    )
    .max(MULTIPART_MAX_PART_COUNT),
});
export const abortMultipartRequestSchema = z.object({
  path: localPathSchema,
  upload_id: uuidSchema,
});
export const partNumberSchema = z.coerce.number().int().min(1).max(MULTIPART_MAX_PART_COUNT);

/**
 * `mpu/<action>/`の後ろのArtifactのディレクトリを解析する。ルートに記録するときは
 * ディレクトリが無い。
 */
export function decodeMultipartDirectory(encodedPath: string): ArtifactLocation {
  let decodedPath: string;
  try {
    decodedPath = decodeURIComponent(encodedPath);
  } catch {
    throw new DomainError({
      status: 422,
      code: 'invalid_request',
      message: 'invalid artifact path',
    });
  }
  return parseArtifactLocation(decodedPath, { directory: true });
}

/** mpuのリクエストパスのうち、エンコードされた`<runs|models>/<id>/artifacts/<directory>`の部分。 */
export function encodedMultipartTarget(requestPath: string, action: MultipartAction): string {
  const prefix = `${MULTIPART_UPLOAD_ROOT}/${action}/`;
  const position = requestPath.indexOf(prefix);
  if (position < 0) throw new DomainError({
    status: 422,
    code: 'invalid_request',
    message: 'invalid artifact path',
  });
  return requestPath.slice(position + prefix.length);
}

/** MLflowのサーバーと同じ: `<directory>/<basename of the client's local path>`。 */
export function multipartArtifactLocation(
  directory: ArtifactLocation,
  localPath: string,
): ArtifactLocation {
  // Windowsのクライアントはバックスラッシュ区切りのパスを送る。
  const fileName = localPath.split(/[\\/]/).at(-1) ?? '';
  const path = directory.path ? `${directory.path}/${fileName}` : fileName;
  return { owner: directory.owner, path: validateArtifactPath(path) };
}

/**
 * SDKはETagの応答ヘッダーをcompleteのpartsに写す。partのSHA-256を使うので、completeは
 * クライアントが送った後にpartが置き換えられたことを見分けられる。
 */
export function partEtag(sha256: string): string {
  return `"${sha256}"`;
}

export function partSha256FromEtag(etag: string | null | undefined): string | null {
  if (!etag) return null;
  const digest = /^"?([0-9a-f]{64})"?$/i.exec(etag)?.[1];
  if (!digest) throw new DomainError({
    status: 422,
    code: 'invalid_request',
    message: 'invalid part ETag',
  });
  return digest.toLowerCase();
}

export function createMultipartResponse(created: {
  uploadId: string;
  partToken: string;
  partCount: number;
  /** `.../mpu/parts`の絶対URL。SDKのrequests.putは絶対URLを要する。 */
  partsUrl: string;
}) {
  return {
    upload_id: created.uploadId,
    credentials: Array.from({ length: created.partCount }, (_, index) => ({
      url: `${created.partsUrl}/${created.uploadId}/${index + 1}`,
      part_number: index + 1,
      headers: { [PART_TOKEN_HEADER]: created.partToken },
    })),
  };
}

/**
 * クライアントが使ったoriginでの、`.../mpu/parts`の絶対URL。nginxとWebアプリの開発用プロキシは
 * Hostヘッダーをそのまま渡し、nginxはTLSの終端をX-Forwarded-Protoで伝える。URLはリクエストした
 * クライアントにだけ返すので、偽のヘッダーで誤らせられるのは、そのクライアント自身のpartの
 * 送り先だけ。
 */
export function multipartPartsUrl(requestUrl: string, forwardedProtocol?: string): string {
  const url = new URL(requestUrl);
  if (forwardedProtocol === 'http' || forwardedProtocol === 'https')
    url.protocol = `${forwardedProtocol}:`;
  const mountPath = url.pathname.slice(0, url.pathname.indexOf(MULTIPART_UPLOAD_ROOT));
  return `${url.origin}${mountPath}${MULTIPART_UPLOAD_ROOT}/parts`;
}
