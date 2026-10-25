// プレビューの表に出す、CSV / TSV / JSON Linesのファイルの行。各セルを文字列にし、列で並べ替え、
// ブラウザの表が重くならない行数で切る。

import type { TabularText } from './tabularText';

/**
 * プレビューの表に描く行数。千行あれば結果のファイルの形は分かる。それを超えると表の描画に
 * 数秒かかり、ファイル全体はダウンロードすればすぐ見られる。
 */
export const TABULAR_TABLE_MAX_ROWS = 1000;

export interface TabularRow {
  line: number;
  cells: string[];
}
export type TabularSortDirection = 'ascending' | 'descending';
export interface TabularSort {
  column: number;
  direction: TabularSortDirection;
}

/** 文字列はそのまま、数値と真偽値は書かれたとおり、入れ子の値はJSON、無い値は空にする。 */
export function tabularCellText(value: unknown): string {
  if (value === undefined || value === null) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

export function toTabularRows(table: TabularText): TabularRow[] {
  return table.records.map((record) => ({ line: record.line, cells: record.cells.map(tabularCellText) }));
}

function numberOfCell(cell: string): number | null {
  const trimmed = cell.trim();
  if (trimmed === '') return null;
  const value = Number(trimmed);
  return Number.isFinite(value) ? value : null;
}

/** 埋まったセルがすべて数値の列。表はこれを右寄せにする。 */
export function isNumericColumn(rows: readonly TabularRow[], column: number): boolean {
  let filled = 0;
  for (const row of rows) {
    const cell = row.cells[column] ?? '';
    if (cell.trim() === '') continue;
    if (numberOfCell(cell) === null) return false;
    filled += 1;
  }
  return filled > 0;
}

// 人が読むように文字列を比べる。"item2"は"item10"より前、日本語は辞書順。
const textCollator = new Intl.Collator('ja', { numeric: true });

/**
 * 2つの数値は数値として、それ以外は文字列として比べる。空のセルは昇順でも降順でも埋まった
 * セルの後ろに置き、等しいセルはファイルの順を保つ。
 */
export function sortTabularRows(rows: readonly TabularRow[], sort: TabularSort | null): TabularRow[] {
  if (!sort) return [...rows];
  const sign = sort.direction === 'descending' ? -1 : 1;
  const keyed = rows.map((row) => {
    const cell = row.cells[sort.column] ?? '';
    return { row, cell, isEmpty: cell.trim() === '', number: numberOfCell(cell) };
  });
  keyed.sort((left, right) => {
    if (left.isEmpty !== right.isEmpty) return left.isEmpty ? 1 : -1;
    if (!left.isEmpty) {
      const order =
        left.number !== null && right.number !== null
          ? left.number - right.number
          : textCollator.compare(left.cell, right.cell);
      if (order !== 0) return order * sign;
    }
    return left.row.line - right.row.line;
  });
  return keyed.map((item) => item.row);
}

/** 見出しを押すたびに、昇順 → 降順 → ファイルの順と切り替わる。 */
export function nextTabularSort(current: TabularSort | null, column: number): TabularSort | null {
  if (current?.column !== column) return { column, direction: 'ascending' };
  return current.direction === 'ascending' ? { column, direction: 'descending' } : null;
}
