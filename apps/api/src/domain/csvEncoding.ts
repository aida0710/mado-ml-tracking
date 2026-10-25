/**
 * 表計算ソフトの利用者向けのCSV（RFC 4180）。改行はCRLF、カンマ・引用符・CR・LFを含む項目は
 * 引用符で囲み、Excelが日本語を文字化けせずに読めるようUTF-8のBOMを付ける。
 */

// decisions.mdでExcelのためにBOMを採用した。BOMなしのUTF-8で出すには''にする。
export const CSV_BYTE_ORDER_MARK = '\uFEFF';
export const CSV_LINE_END = '\r\n';
export const CSV_CONTENT_TYPE = 'text/csv; charset=utf-8';

// 表計算ソフトは、これらで始まるテキストを数式として評価する（CSV injection、OWASP）。
const FORMULA_TRIGGER = /^[=+\-@\t\r]/;
const NEEDS_QUOTING = /[",\r\n]/;

/**
 * 数値はNaNと±Infinityも含めてそのまま書き、-0.5のような数値のメトリクスが値を保つようにする。
 * 数式への対策をするのはテキストだけ。nullとundefinedは空のセル。
 */
export type CsvCell = string | number | boolean | null | undefined;

export function encodeCsvCell(cell: CsvCell): string {
  if (cell === null || cell === undefined) return '';
  if (typeof cell === 'number' || typeof cell === 'boolean') return String(cell);
  const guarded = FORMULA_TRIGGER.test(cell) ? `'${cell}` : cell;
  return NEEDS_QUOTING.test(guarded) ? `"${guarded.replace(/"/g, '""')}"` : guarded;
}

export function encodeCsvLine(cells: readonly CsvCell[]): string {
  return cells.map(encodeCsvCell).join(',') + CSV_LINE_END;
}

export function encodeCsvDocument(lines: readonly (readonly CsvCell[])[]): string {
  return CSV_BYTE_ORDER_MARK + lines.map(encodeCsvLine).join('');
}
