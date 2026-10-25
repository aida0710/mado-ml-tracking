import type {
  MediaTableColumn,
  MediaTableColumnType,
  MediaTableReferenceError,
} from '@mmt/contracts';
import { DomainError } from './errors.js';

/**
 * メディアの表は、MLflowのlog_tableが書くpandasのorient='split'のJSON（{columns, data}）。
 * メディアのセルは、MLflowの{type:'image', filepath, compressed_filepath?}、同じ形でtypeが
 * 'audio'か'video'のもの（ネイティブの表）、またはファイルを指すmmt-artifact://の文字列の参照。
 *
 * パスは画面の評価サンプルの規則（apps/web/src/lib/evaluationSamples.tsの
 * resolveArtifactReference）に従う。相対パスは表を持つRunのArtifactで、
 * mmt-artifact://runs/<runId>/<path>（または.../projects/<projectId>/runs/...）は同じ
 * Projectの別のRunを指す。APIは画面のコードをimportできないので、規則をここにも書く。
 */

export type MediaCellType = 'audio' | 'image' | 'video';

export interface ParsedMediaTable {
  columns: MediaTableColumn[];
  rows: unknown[][];
}

export interface ArtifactReference {
  runId: string;
  path: string;
}

export type ArtifactReferenceResult =
  | { ok: true; reference: ArtifactReference }
  | { ok: false; error: MediaTableReferenceError };

/** Artifactを引く前の、メディアのセルが指す先。 */
export interface MediaCellReference {
  type: MediaCellType;
  file: ArtifactReferenceResult;
  /** MLflowのcompressed_filepath。セルに無ければnull。 */
  thumbnail: ArtifactReferenceResult | null;
}

export const ARTIFACT_REFERENCE_SCHEME = 'mmt-artifact://';
const MEDIA_CELL_TYPES: readonly MediaCellType[] = ['audio', 'image', 'video'];
// 文字列の参照の種類は拡張子で決める。ほかのファイルはただのテキストのまま。
const EXTENSION_CELL_TYPES: Record<string, MediaCellType> = {
  wav: 'audio',
  flac: 'audio',
  mp3: 'audio',
  ogg: 'audio',
  opus: 'audio',
  m4a: 'audio',
  aac: 'audio',
  png: 'image',
  jpg: 'image',
  jpeg: 'image',
  gif: 'image',
  webp: 'image',
  bmp: 'image',
  mp4: 'video',
  webm: 'video',
  mov: 'video',
  mkv: 'video',
};
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const URI_SCHEME_PATTERN = /^[a-z][a-z0-9+.-]*:/i;
const BYTE_ORDER_MARK = '﻿';

function invalidTable(detail: string): never {
  throw new DomainError({
    status: 422,
    code: 'media_table_invalid',
    message: `invalid table format: ${detail}`,
    details: { detail },
  });
}

/** ParquetはMLflowのlog_tableのもう1つの形式。読むのはJSONのsplit形式だけ。 */
export function isParquetTable(table: { path: string; mimeType: string }): boolean {
  const essence = table.mimeType.split(';')[0]!.trim().toLowerCase();
  return table.path.toLowerCase().endsWith('.parquet') || essence === 'application/vnd.apache.parquet';
}

export function parseMediaTable(content: string): ParsedMediaTable {
  const text = content.startsWith(BYTE_ORDER_MARK) ? content.slice(1) : content;
  let document: unknown;
  try {
    document = JSON.parse(text);
  } catch {
    invalidTable('not valid JSON');
  }
  if (typeof document !== 'object' || document === null || Array.isArray(document))
    invalidTable('an object of {columns, data} is required');
  const { columns, data } = document as { columns?: unknown; data?: unknown };
  if (!Array.isArray(columns) || !columns.every((name) => typeof name === 'string'))
    invalidTable('columns must be an array of strings');
  if (!Array.isArray(data)) invalidTable('data must be an array');
  data.forEach((row, index) => {
    if (!Array.isArray(row) || row.length !== columns.length)
      invalidTable(`row ${index + 1} has a different number of values than columns`);
  });
  const rows = data as unknown[][];
  return {
    columns: (columns as string[]).map((name, index) => ({
      name,
      type: columnType(rows.map((row) => row[index])),
    })),
    rows,
  };
}

/** 1つのセルが持つメディアの種類。それ以外の値はnull。 */
export function mediaCellType(cell: unknown): MediaCellType | null {
  if (typeof cell === 'string') {
    if (!cell.startsWith(ARTIFACT_REFERENCE_SCHEME)) return null;
    const extension = /\.([a-z0-9]+)$/i.exec(cell)?.[1]?.toLowerCase();
    return (extension && EXTENSION_CELL_TYPES[extension]) || null;
  }
  if (typeof cell !== 'object' || cell === null || Array.isArray(cell)) return null;
  const { type, filepath } = cell as { type?: unknown; filepath?: unknown };
  return MEDIA_CELL_TYPES.includes(type as MediaCellType) && typeof filepath === 'string'
    ? (type as MediaCellType)
    : null;
}

/** すべての値が同じ種類のメディアなら、その列はメディアの列。nullの値は飛ばす。 */
function columnType(values: unknown[]): MediaTableColumnType {
  const present = values.filter((value) => value !== null && value !== undefined);
  if (present.length === 0) return 'text';
  const firstMediaType = mediaCellType(present[0]);
  if (firstMediaType && present.every((value) => mediaCellType(value) === firstMediaType))
    return firstMediaType;
  if (present.every((value) => typeof value === 'number')) return 'number';
  if (present.every((value) => typeof value === 'string')) return 'text';
  return 'json';
}

/** メディアの列のセルが指すファイル（とMLflowのサムネイル）。表のRunを基準にする。 */
export function mediaCellReference(
  cell: unknown,
  context: { projectId: string; tableRunId: string },
): MediaCellReference | null {
  const type = mediaCellType(cell);
  if (!type) return null;
  if (typeof cell === 'string')
    return { type, file: resolveArtifactReference(cell, context), thumbnail: null };
  const { filepath, compressed_filepath: thumbnailPath } = cell as {
    filepath: string;
    compressed_filepath?: unknown;
  };
  return {
    type,
    file: resolveArtifactReference(filepath, context),
    thumbnail:
      typeof thumbnailPath === 'string' ? resolveArtifactReference(thumbnailPath, context) : null,
  };
}

/** "."と空の要素を除く。Artifactのパスと同じく文字どおりに扱う（パーセントデコードしない）。 */
function normalizeArtifactPath(path: string): { path: string } | { error: MediaTableReferenceError } {
  if (path.startsWith('/')) return { error: 'absolute_path' };
  const segments = path.split('/').filter((segment) => segment !== '' && segment !== '.');
  if (segments.includes('..')) return { error: 'parent_path' };
  if (segments.length === 0) return { error: 'empty' };
  return { path: segments.join('/') };
}

/** apps/web/src/lib/evaluationSamples.tsのresolveArtifactReferenceと同じ規則。 */
export function resolveArtifactReference(
  value: string,
  context: { projectId: string; tableRunId: string },
): ArtifactReferenceResult {
  const trimmed = value.trim();
  if (trimmed === '') return { ok: false, error: 'empty' };
  if (trimmed.startsWith(ARTIFACT_REFERENCE_SCHEME)) {
    let segments = trimmed.slice(ARTIFACT_REFERENCE_SCHEME.length).split('/');
    if (segments[0] === 'projects') {
      if (!UUID_PATTERN.test(segments[1] ?? '')) return { ok: false, error: 'invalid_run_reference' };
      if (segments[1]!.toLowerCase() !== context.projectId.toLowerCase())
        return { ok: false, error: 'other_project' };
      segments = segments.slice(2);
    }
    const [kind, runId, ...rest] = segments;
    if (kind !== 'runs' || !UUID_PATTERN.test(runId ?? ''))
      return { ok: false, error: 'invalid_run_reference' };
    const normalized = normalizeArtifactPath(rest.join('/'));
    return 'error' in normalized
      ? { ok: false, error: normalized.error }
      : { ok: true, reference: { runId: runId!.toLowerCase(), path: normalized.path } };
  }
  if (URI_SCHEME_PATTERN.test(trimmed)) return { ok: false, error: 'unsupported_scheme' };
  const normalized = normalizeArtifactPath(trimmed);
  if ('error' in normalized) return { ok: false, error: normalized.error };
  return { ok: true, reference: { runId: context.tableRunId.toLowerCase(), path: normalized.path } };
}
