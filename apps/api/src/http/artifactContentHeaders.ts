import type { Artifact } from '@mmt/contracts';
import type { ArtifactContent } from '@mmt/platform';
import { isInlineArtifactMimeType } from '../domain/artifactMimeType.js';

// Artifactのidが指す中身は変わらないので、ネイティブの中身のURLは1年間のprivateキャッシュで安全。
export const IMMUTABLE_ARTIFACT_CACHE_CONTROL = 'private, max-age=31536000, immutable';
// MLflowのパスは別のArtifactを指し直せるので、その応答をキャッシュしてはならない。
export const MUTABLE_ARTIFACT_CACHE_CONTROL = 'private, no-store';

export type ArtifactDisposition = 'inline-when-safe' | 'attachment';

export function artifactEntityTag(artifact: Pick<Artifact, 'sha256'>): string {
  return `"sha256-${artifact.sha256}"`;
}

function encodeFilename(filename: string): string {
  // RFC 5987ではこれらの文字は予約されていないが、filename*の中で誤って解釈するクライアントがある。
  return encodeURIComponent(filename).replace(
    /['()*]/g,
    (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

function contentDisposition(artifact: Artifact, disposition: ArtifactDisposition): string {
  const isInline =
    disposition === 'inline-when-safe' && isInlineArtifactMimeType(artifact.mimeType);
  const filename = artifact.path.split('/').at(-1)!;
  return `${isInline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeFilename(filename)}`;
}

/** 1つのArtifactの全体・部分・not-modifiedの応答で共通のヘッダー。 */
export function artifactValidatorHeaders(
  artifact: Artifact,
  cacheControl: string,
): Record<string, string> {
  return { ETag: artifactEntityTag(artifact), 'Cache-Control': cacheControl };
}

export function artifactContentHeaders(download: {
  artifact: Artifact;
  content: ArtifactContent;
  disposition: ArtifactDisposition;
  cacheControl: string;
}): Record<string, string> {
  const { artifact, content } = download;
  const headers: Record<string, string> = {
    ...artifactValidatorHeaders(artifact, download.cacheControl),
    'Content-Type': artifact.mimeType,
    'Content-Length': String(content.size),
    'Accept-Ranges': 'bytes',
    'Content-Disposition': contentDisposition(artifact, download.disposition),
    'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': "sandbox; default-src 'none'",
  };
  if (content.contentRange) headers['Content-Range'] = content.contentRange;
  return headers;
}

function entityTagList(header: string): string[] {
  return header.split(',').map((tag) => tag.trim());
}

/** If-None-Matchは弱い比較を使うので、中継者が付けたW/の前置きがあっても一致する。 */
export function matchesIfNoneMatch(header: string | undefined, artifact: Artifact): boolean {
  if (!header) return false;
  const entityTag = artifactEntityTag(artifact);
  return entityTagList(header).some((tag) => tag === '*' || tag.replace(/^W\//, '') === entityTag);
}

/**
 * If-Rangeは強い比較が必要。ArtifactはLast-Modifiedを出さないので日付は決して一致せず、
 * クライアントは全体の表現を受け取る。それは常に正しい。
 */
export function shouldServeRange(ifRangeHeader: string | undefined, artifact: Artifact): boolean {
  if (!ifRangeHeader) return true;
  return ifRangeHeader.trim() === artifactEntityTag(artifact);
}
