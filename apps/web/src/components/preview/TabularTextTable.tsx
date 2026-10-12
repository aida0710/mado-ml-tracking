import { useMemo, useState, type ReactNode } from 'react';
import { ArrowDown, ArrowUp } from 'lucide-react';
import type { TabularText } from '../../lib/tabularText';
import {
  TABULAR_TABLE_MAX_ROWS,
  isNumericColumn,
  nextTabularSort,
  sortTabularRows,
  toTabularRows,
  type TabularSort,
} from '../../lib/tabularTableRows';
import { BrokenRowCount, BrokenRowsDetails } from './BrokenRowsDetails';
import { useLocale } from '../../i18n/useLocale';
import { text, textTemplates } from '../../i18n/catalog';

function SortIcon({ sort, column }: { sort: TabularSort | null; column: number }) {
  useLocale();
  if (sort?.column !== column) return null;
  return sort.direction === 'ascending' ? <ArrowUp size={12} aria-hidden="true" /> : <ArrowDown size={12} aria-hidden="true" />;
}

/**
 * A CSV / TSV / jsonl file as a table: the header stays in view while the rows scroll inside the
 * frame, and a column header sorts every row by that column (again to reverse, a third time for
 * the file's order). Only the first TABULAR_TABLE_MAX_ROWS rows are drawn.
 */
export function TabularTextTable({
  table,
  label,
  formatSelect,
}: {
  table: TabularText;
  /** Names the scrolling frame for screen readers, usually the file's path. */
  label: string;
  /** The ［表示形式］ select, to switch this file to text. */
  formatSelect: ReactNode;
}) {
  useLocale();
  const rows = useMemo(() => toTabularRows(table), [table]);
  const numericColumns = useMemo(() => table.columns.map((_, column) => isNumericColumn(rows, column)), [rows, table.columns]);
  const [sort, setSort] = useState<TabularSort | null>(null);
  const sorted = useMemo(() => sortTabularRows(rows, sort), [rows, sort]);
  const shown = sorted.slice(0, TABULAR_TABLE_MAX_ROWS);

  return (
    <div className="tabular-preview">
      <div className="tabular-preview-toolbar">
        <span>{textTemplates.tabularTableSize(rows.length, table.columns.length)}</span>
        <BrokenRowCount errors={table.errors} />
        <span className="preview-toolbar-end">{formatSelect}</span>
      </div>
      {rows.length > shown.length && (
        <p className="muted tabular-preview-note">{textTemplates.tabularTableTruncated(shown.length, rows.length)}</p>
      )}
      <BrokenRowsDetails errors={table.errors} />
      {/* Focusable so a keyboard can scroll the frame sideways and down. */}
      <div className="tabular-table-scroll" role="region" aria-label={label} tabIndex={0}>
        <table className="tabular-table">
          <thead>
            <tr>
              <th scope="col">{text.evaluationLineColumn}</th>
              {table.columns.map((column, index) => {
                const name = column || text.artifactUnnamed;
                const sortState = sort?.column === index ? sort.direction : 'none';
                return (
                  <th key={index} scope="col" aria-sort={sortState} className={numericColumns[index] ? 'tabular-number' : undefined}>
                    <button
                      type="button"
                      className="tabular-sort-button"
                      title={textTemplates.tabularSortBy(name)}
                      onClick={() => setSort(nextTabularSort(sort, index))}
                    >
                      {name}
                      <SortIcon sort={sort} column={index} />
                    </button>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {shown.map((row) => (
              <tr key={row.line}>
                <td className="mono">{row.line}</td>
                {row.cells.map((cell, index) => (
                  <td key={index} className={numericColumns[index] ? 'tabular-number' : undefined}>
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
