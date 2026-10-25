export const FALLBACK_ARTIFACT_MIME_TYPE = 'application/octet-stream';

// 推定したテキストの型にはUTF-8を明示し、日本語のラベルをその場でプレビューしても
// 文字化けしないようにする。
const UTF8_TEXT = '; charset=utf-8';

// HTML、SVG、XML、JavaScriptは推定しない。推測で付けた実行可能な型をブラウザへ届けてはならない。
const mimeTypesByExtension: Record<string, string> = {
  wav: 'audio/wav',
  flac: 'audio/flac',
  mp3: 'audio/mpeg',
  ogg: 'audio/ogg',
  // OpusのファイルはOggのコンテナに入っている。ブラウザはOggの型で再生する。
  opus: 'audio/ogg',
  m4a: 'audio/mp4',
  aac: 'audio/aac',
  webm: 'video/webm',
  mp4: 'video/mp4',
  mov: 'video/quicktime',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  avif: 'image/avif',
  gif: 'image/gif',
  csv: `text/csv${UTF8_TEXT}`,
  tsv: `text/tab-separated-values${UTF8_TEXT}`,
  jsonl: `application/x-ndjson${UTF8_TEXT}`,
  txt: `text/plain${UTF8_TEXT}`,
  npy: 'application/x-npy',
  parquet: 'application/vnd.apache.parquet',
};

// 実行されないメディアとプレーンテキストだけ。それ以外の型は添付ファイル（attachment）として返す。
const inlineMimeTypes = new Set([
  'text/plain',
  'text/csv',
  'text/tab-separated-values',
  'application/json',
  'application/x-ndjson',
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/avif',
  'image/gif',
  'audio/wav',
  'audio/x-wav',
  'audio/flac',
  'audio/x-flac',
  'audio/mpeg',
  'audio/ogg',
  'audio/opus',
  'audio/mp4',
  'audio/aac',
  'audio/webm',
  'video/mp4',
  'video/webm',
  'video/quicktime',
]);

const MIME_TYPE_PATTERN = /^[\w!#$&^.+-]+\/[\w!#$&^.+-]+(?:;[^\r\n]*)?$/;

export function essenceOfMimeType(mimeType: string): string {
  return mimeType.split(';')[0]!.trim().toLowerCase();
}

export function inferMimeTypeFromPath(path: string): string | null {
  const filename = path.split('/').at(-1) ?? '';
  const dot = filename.lastIndexOf('.');
  if (dot <= 0) return null;
  return mimeTypesByExtension[filename.slice(dot + 1).toLowerCase()] ?? null;
}

/** クライアントが具体的な型を宣言していればそれを使い、無いときだけ拡張子から推定する。 */
export function resolveArtifactMimeType(upload: {
  path: string;
  declaredMimeType?: string;
}): string {
  const declared = upload.declaredMimeType?.trim() ?? '';
  const isSpecific =
    MIME_TYPE_PATTERN.test(declared) && essenceOfMimeType(declared) !== FALLBACK_ARTIFACT_MIME_TYPE;
  if (isSpecific) return declared;
  return inferMimeTypeFromPath(upload.path) ?? FALLBACK_ARTIFACT_MIME_TYPE;
}

export function isInlineArtifactMimeType(mimeType: string): boolean {
  return inlineMimeTypes.has(essenceOfMimeType(mimeType));
}
