import type { SavedViewColumn } from '@mmt/contracts';

// Runの一覧の動かせる列。どれを表示し、どの順で、どの幅にするか。選択と名前は先頭に固定で、
// この一覧には入らない。

/** タグの列の代わりに、Runの説明（`mlflow.note.content`）の1行目を表示する。 */
export const RUN_DESCRIPTION_COLUMN = 'description';
export const RUN_BASE_COLUMNS = ['status', 'created', 'duration', 'user', 'kind'] as const;
// それぞれ2つにして、利用者がさらに列を選ぶ前の最初の比較を読みやすく保つ。
const DEFAULT_METRIC_COLUMNS = 2;
const DEFAULT_PARAMETER_COLUMNS = 2;
/** これより狭いと短い数でも隠れ、これより広いとほかの列をすべて押し出してしまう。 */
export const MIN_COLUMN_WIDTH = 48;
export const MAX_COLUMN_WIDTH = 1200;

export const metricColumn = (name: string) => `metrics.${name}`;
export const parameterColumn = (name: string) => `params.${name}`;
export const tagColumn = (name: string) => `tags.${name}`;

export function defaultRunColumns(metricNames: string[], parameterNames: string[]): SavedViewColumn[] {
  return [
    'status',
    'created',
    'duration',
    ...metricNames.slice(0, DEFAULT_METRIC_COLUMNS).map(metricColumn),
    ...parameterNames.slice(0, DEFAULT_PARAMETER_COLUMNS).map(parameterColumn),
    'user',
  ].map((key) => ({ key }));
}

/** 表示中の列なら隠し、隠れた列なら末尾に表示する。 */
export function toggleColumn(columns: SavedViewColumn[], key: string): SavedViewColumn[] {
  return columns.some((column) => column.key === key)
    ? columns.filter((column) => column.key !== key)
    : [...columns, { key }];
}

/** `key`を`targetKey`の位置へ動かし、その間の列をずらす。 */
export function moveColumn(
  columns: SavedViewColumn[],
  key: string,
  targetKey: string,
): SavedViewColumn[] {
  const from = columns.findIndex((column) => column.key === key);
  const to = columns.findIndex((column) => column.key === targetKey);
  if (from < 0 || to < 0 || from === to) return columns;
  const next = [...columns];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved!);
  return next;
}

/** `key`を1つ左（-1）か右（1）へ動かす。端の列はそのまま。 */
export function shiftColumn(
  columns: SavedViewColumn[],
  key: string,
  offset: -1 | 1,
): SavedViewColumn[] {
  const index = columns.findIndex((column) => column.key === key);
  const target = columns[index + offset];
  return index < 0 || !target ? columns : moveColumn(columns, key, target.key);
}

export const clampColumnWidth = (width: number) =>
  Math.min(MAX_COLUMN_WIDTH, Math.max(MIN_COLUMN_WIDTH, Math.round(width)));

export function resizeColumn(
  columns: SavedViewColumn[],
  key: string,
  width: number,
): SavedViewColumn[] {
  return columns.map((column) =>
    column.key === key ? { ...column, width: clampColumnWidth(width) } : column,
  );
}

/** Markdownの説明の、空でない最初の行。見出しやリストの記号は除く。 */
export function descriptionSummary(description: string): string {
  const line = description.split('\n').find((candidate) => candidate.trim()) ?? '';
  return line.trim().replace(/^(?:#{1,6}\s+|[-*+]\s+|>\s*)/, '');
}
