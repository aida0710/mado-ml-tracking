import { describe, expect, it } from 'vitest';
import {
  TABULAR_TABLE_MAX_ROWS,
  isNumericColumn,
  nextTabularSort,
  sortTabularRows,
  tabularCellText,
  toTabularRows,
} from './tabularTableRows';

const rows = [
  { line: 2, cells: ['b', '10'] },
  { line: 3, cells: ['', '9'] },
  { line: 4, cells: ['a', ''] },
  { line: 5, cells: ['a', '10'] },
];
const linesOf = (sorted: { line: number }[]) => sorted.map((row) => row.line);

describe('表のセル', () => {
  it('文字列はそのまま、数値と真偽値は書かれたとおり、入れ子はJSON、無い値は空にする', () => {
    expect(tabularCellText('x')).toBe('x');
    expect(tabularCellText(0.1)).toBe('0.1');
    expect(tabularCellText(false)).toBe('false');
    expect(tabularCellText({ a: [1] })).toBe('{"a":[1]}');
    expect(tabularCellText(null)).toBe('');
    expect(tabularCellText(undefined)).toBe('');
    expect(toTabularRows({ columns: ['a'], records: [{ line: 1, cells: [1] }], errors: [] })).toEqual([
      { line: 1, cells: ['1'] },
    ]);
  });

  it('空でないセルがすべて数値の列だけを数値の列とする', () => {
    expect(isNumericColumn(rows, 1)).toBe(true);
    expect(isNumericColumn(rows, 0)).toBe(false);
    expect(isNumericColumn([{ line: 1, cells: [''] }], 0)).toBe(false);
  });
});

describe('表の並べ替え', () => {
  it('数値どうしは数として比べ、空のセルはどちらの向きでも最後、同じ値はファイルの順を保つ', () => {
    expect(linesOf(sortTabularRows(rows, { column: 1, direction: 'ascending' }))).toEqual([3, 2, 5, 4]);
    expect(linesOf(sortTabularRows(rows, { column: 1, direction: 'descending' }))).toEqual([2, 5, 3, 4]);
    expect(linesOf(sortTabularRows(rows, { column: 0, direction: 'ascending' }))).toEqual([4, 5, 2, 3]);
    expect(linesOf(sortTabularRows(rows, null))).toEqual([2, 3, 4, 5]);
  });

  it('文字列は人が読む順（item2 は item10 より前）で比べる', () => {
    const names = [
      { line: 1, cells: ['item10'] },
      { line: 2, cells: ['item2'] },
    ];
    expect(linesOf(sortTabularRows(names, { column: 0, direction: 'ascending' }))).toEqual([2, 1]);
  });

  it('見出しを押すたびに昇順、降順、ファイルの順と切り替わり、別の列は昇順から始まる', () => {
    const ascending = nextTabularSort(null, 1);
    expect(ascending).toEqual({ column: 1, direction: 'ascending' });
    const descending = nextTabularSort(ascending, 1);
    expect(descending).toEqual({ column: 1, direction: 'descending' });
    expect(nextTabularSort(descending, 1)).toBeNull();
    expect(nextTabularSort(descending, 0)).toEqual({ column: 0, direction: 'ascending' });
  });

  it('描く行数の上限は1,000行', () => {
    expect(TABULAR_TABLE_MAX_ROWS).toBe(1000);
  });
});
