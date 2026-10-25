import { useId, useState, type MouseEvent, type ReactNode } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { Empty } from './Feedback';
import { narrowerThan } from '@mado/design-system/layout';
import { useMediaQuery } from '@mado/design-system/react';
import { splitColumnsByPriority, type ColumnPriority } from '../lib/responsiveColumns';
import { useLocale } from '../i18n/useLocale';
import { text } from '../i18n/catalog';

export interface ResponsiveTableColumn<T> {
  key: string;
  header: ReactNode;
  render: (row: T) => ReactNode;
  /**
   * primaryの列は狭い画面でも行に残る。secondaryの列は開いた行の中へ移る。detailの列は常に開いた行の
   * 中に置き、長い文で広い表がさらに広がらないようにする。
   */
  priority: ColumnPriority;
  className?: string;
}

export interface ResponsiveTableProps<T> {
  columns: ResponsiveTableColumn<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  /** ポインタ向けの近道。キーボードの利用者のため、primaryの列にリンクかボタンを置いておく。 */
  onRowClick?: (row: T) => void;
  /** 画面が選んでいる行のkey（たとえば横のパネルに出している行）。 */
  selectedKey?: string;
  /** まとめて選んだ行（一括操作でチェックした行など）に、selectedKeyと同じ印を付ける。 */
  isSelected?: (row: T) => boolean;
  /** 行が無いとき、表の代わりに表示する。 */
  empty?: ReactNode;
  /** 見出しが名前を付けていないときの、表のアクセシブルな名前。 */
  label?: string;
}

// セルの中の操作部品はそれ自身の働きを保つ。行を開くのは、行の地の文をクリックしたときだけ。
const INTERACTIVE_SELECTOR = 'a, button, input, select, textarea, label, summary';

function isFromCellControl(event: MouseEvent<HTMLElement>) {
  const control = (event.target as Element).closest(INTERACTIVE_SELECTOR);
  return control !== null && event.currentTarget.contains(control);
}

function rowClassName({ isClickable, isSelected }: { isClickable: boolean; isSelected: boolean }) {
  return [isClickable && 'clickable-row', isSelected && 'selected'].filter(Boolean).join(' ') || undefined;
}

/**
 * スマートフォンに収める一覧の表。900px未満ではprimaryの列だけを行に残し、各行のボタンで
 * secondaryの列をその下に開く。
 */
export function ResponsiveTable<T>(props: ResponsiveTableProps<T>) {
  useLocale();
  const isNarrow = useMediaQuery(narrowerThan('md'));
  return <ResponsiveTableView {...props} isNarrow={isNarrow} />;
}

/** 幅が分かっているときの表。テストで両方の配置を描けるよう、ResponsiveTableから分けてある。 */
export function ResponsiveTableView<T>({
  columns,
  rows,
  rowKey,
  onRowClick,
  selectedKey,
  isSelected,
  empty,
  label,
  isNarrow,
}: ResponsiveTableProps<T> & { isNarrow: boolean }) {
  useLocale();
  const detailIdPrefix = useId();
  const [openRowKeys, setOpenRowKeys] = useState<ReadonlySet<string>>(new Set());
  if (!rows.length) return <Empty>{empty}</Empty>;
  const { rowColumns, detailColumns } = splitColumnsByPriority(columns, isNarrow);
  const hasDetails = detailColumns.length > 0;
  const toggleRow = (key: string) =>
    setOpenRowKeys((current) => {
      const next = new Set(current);
      if (!next.delete(key)) next.add(key);
      return next;
    });
  return (
    <div className="table-scroll">
      <table className="responsive-table" aria-label={label}>
        <thead>
          <tr>
            {rowColumns.map((column) => (
              <th key={column.key} scope="col" className={column.className}>
                {column.header}
              </th>
            ))}
            {hasDetails && (
              <th scope="col" className="responsive-table-toggle">
                <span className="sr-only">{text.showRowDetails}</span>
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => {
            const key = rowKey(row);
            const isOpen = hasDetails && openRowKeys.has(key);
            const detailId = `${detailIdPrefix}-${index}`;
            return [
              <tr
                key={key}
                className={rowClassName({
                  isClickable: Boolean(onRowClick),
                  isSelected: key === selectedKey || Boolean(isSelected?.(row)),
                })}
                onClick={
                  onRowClick &&
                  ((event) => {
                    if (!isFromCellControl(event)) onRowClick(row);
                  })
                }
              >
                {rowColumns.map((column) => (
                  <td key={column.key} className={column.className}>
                    {column.render(row)}
                  </td>
                ))}
                {hasDetails && (
                  <td className="responsive-table-toggle">
                    <button
                      type="button"
                      className="icon-button"
                      aria-expanded={isOpen}
                      aria-controls={detailId}
                      aria-label={isOpen ? text.hideRowDetails : text.showRowDetails}
                      onClick={() => toggleRow(key)}
                    >
                      {isOpen ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                    </button>
                  </td>
                )}
              </tr>,
              isOpen && (
                <tr key={`${key}-details`} id={detailId} className="responsive-table-details">
                  <td colSpan={rowColumns.length + 1}>
                    <dl>
                      {detailColumns.map((column) => (
                        <div key={column.key}>
                          <dt>{column.header}</dt>
                          <dd className={column.className}>{column.render(row)}</dd>
                        </div>
                      ))}
                    </dl>
                  </td>
                </tr>
              ),
            ];
          })}
        </tbody>
      </table>
    </div>
  );
}
