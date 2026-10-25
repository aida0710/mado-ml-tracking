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
 * CSV / TSV / jsonlのファイルを表で出す。行は枠の中でスクロールし、見出しは見えたまま残る。
 * 列の見出しで全行をその列で並べ替える（もう一度で逆順、3回目でファイルの順）。描くのは
 * 先頭のTABULAR_TABLE_MAX_ROWS行だけ。
 */
export function TabularTextTable({
  table,
  label,
  formatSelect,
}: {
  table: TabularText;
  /** スクロールする枠の、スクリーンリーダー向けの名前。たいていはファイルのパス。 */
  label: string;
  /** ［表示形式］のselect。このファイルをテキストに切り替える。 */
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
      {/* フォーカスできるようにし、キーボードで枠を横にも下にもスクロールできるようにする。 */}
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
