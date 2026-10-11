// The rows of a CSV / TSV / JSON Lines file as shown in the preview table: each cell as text,
// sorted by a column, and cut to a number of rows a browser table stays responsive with.

import type { TabularText } from './tabularText';

/**
 * Rows drawn in the preview table. A thousand rows show the shape of a result file; past that the
 * table takes seconds to draw, and the whole file is one download away.
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

/** Strings as they are, numbers and booleans as written, nested values as JSON, missing as empty. */
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

/** A column whose every filled cell is a number; the table right-aligns it. */
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

// Text compares like a person reads it: "item2" before "item10", Japanese in dictionary order.
const textCollator = new Intl.Collator('ja', { numeric: true });

/**
 * Two numbers compare as numbers, anything else as text. Empty cells stay after filled ones in
 * both directions, and equal cells keep the file's order.
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

/** Header clicks cycle ascending → descending → the file's order. */
export function nextTabularSort(current: TabularSort | null, column: number): TabularSort | null {
  if (current?.column !== column) return { column, direction: 'ascending' };
  return current.direction === 'ascending' ? { column, direction: 'descending' } : null;
}
