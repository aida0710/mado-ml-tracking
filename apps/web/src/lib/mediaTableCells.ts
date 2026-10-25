// Runのメディアの表（MLflowのlog_tableのsplit形式に、audioとvideoの列を足したもの）のセル。
// 各セルに何を出すかと、APIが解決できなかったメディアのセル。
import type { MediaTableColumn, MediaTableColumnType, MediaTableReferenceError } from '@mmt/contracts';
import { formatValue } from './format';

export const MEDIA_TABLE_PAGE_SIZE = 50;

export type MediaCellType = 'audio' | 'image' | 'video';
const MEDIA_COLUMN_TYPES: readonly MediaTableColumnType[] = ['audio', 'image', 'video'];

/**
 * 'unresolved'は、APIが解決した形になっていないメディアのセル（MLflowの{type, filepath}の
 * セルや、文字列のままのmmt-artifact://参照など）。Artifactを指していないので、Webはpathから
 * 推測しない。
 */
export type MediaTableCellFailure = MediaTableReferenceError | 'unresolved';

export interface ResolvedMediaCell {
  type: MediaCellType;
  runId: string | null;
  path: string;
  artifactId: string;
  thumbnailArtifactId: string | null;
}

export type MediaTableCellView =
  | { kind: 'empty' }
  | { kind: 'text'; text: string }
  | { kind: 'number'; text: string }
  | { kind: 'json'; text: string }
  | { kind: 'media'; media: ResolvedMediaCell }
  | { kind: 'error'; reason: MediaTableCellFailure; path: string };

export function isMediaColumnType(type: MediaTableColumnType): type is MediaCellType {
  return MEDIA_COLUMN_TYPES.includes(type);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const REFERENCE_ERRORS: readonly MediaTableReferenceError[] = [
  'empty',
  'absolute_path',
  'parent_path',
  'unsupported_scheme',
  'invalid_run_reference',
  'other_project',
  'not_found',
];

function writtenPath(value: unknown): string {
  if (typeof value === 'string') return value;
  if (isRecord(value)) {
    for (const field of ['path', 'filepath'] as const) if (typeof value[field] === 'string') return value[field];
    if (value.path === null) return '';
  }
  return formatValue(value);
}

function describeMediaCell(columnType: MediaCellType, value: unknown): MediaTableCellView {
  if (value === null || value === undefined) return { kind: 'empty' };
  const path = writtenPath(value);
  if (!isRecord(value)) return { kind: 'error', reason: 'unresolved', path };
  if (typeof value.error === 'string') {
    const reason = REFERENCE_ERRORS.includes(value.error as MediaTableReferenceError)
      ? (value.error as MediaTableReferenceError)
      : 'unresolved';
    return { kind: 'error', reason, path };
  }
  if (typeof value.artifactId !== 'string' || value.artifactId === '') return { kind: 'error', reason: 'unresolved', path };
  // セル自身の種類が列と食い違うとき（audioの列にある画像）は、セル自身の種類で出す。
  const type = MEDIA_COLUMN_TYPES.includes(value.type as MediaTableColumnType) ? (value.type as MediaCellType) : columnType;
  return {
    kind: 'media',
    media: {
      type,
      runId: typeof value.runId === 'string' ? value.runId : null,
      path,
      artifactId: value.artifactId,
      thumbnailArtifactId: typeof value.thumbnailArtifactId === 'string' ? value.thumbnailArtifactId : null,
    },
  };
}

/** 1つのセルの出し方。列の種類で決め、次に値そのもので決める。 */
export function describeTableCell(column: MediaTableColumn, value: unknown): MediaTableCellView {
  if (isMediaColumnType(column.type)) return describeMediaCell(column.type, value);
  if (value === null || value === undefined) return { kind: 'empty' };
  if (column.type === 'number' && typeof value === 'number') return { kind: 'number', text: formatValue(value) };
  if (typeof value === 'string') return { kind: 'text', text: value };
  if (typeof value === 'number' || typeof value === 'boolean') return { kind: 'text', text: String(value) };
  return { kind: 'json', text: JSON.stringify(value) };
}

/** そのページで出せなかったメディアのセル。いくつあるかを表が伝えられるように数える。 */
export function countErrorCells(columns: readonly MediaTableColumn[], rows: readonly unknown[][]): number {
  let errors = 0;
  for (const row of rows)
    columns.forEach((column, index) => {
      if (describeTableCell(column, row[index]).kind === 'error') errors += 1;
    });
  return errors;
}

/** offsetでページを分ける表のページ数。空の表でも（空の）ページが1つある。 */
export function tablePageCount(totalRows: number, pageSize = MEDIA_TABLE_PAGE_SIZE): number {
  return Math.max(1, Math.ceil(totalRows / pageSize));
}
