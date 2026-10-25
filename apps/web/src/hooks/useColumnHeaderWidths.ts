import { useLayoutEffect, useState, type RefObject } from 'react';

/**
 * 表の各列見出し（th[data-column]）の描画された幅を、列のキーごとに持ち、表の大きさが変わるたびに
 * 更新する。利用者が幅を決めていない列は内容の幅になるが、そのリサイズのハンドルも支援技術に幅を
 * 伝える必要がある（aria-valuenow）。
 */
export function useColumnHeaderWidths(tableRef: RefObject<HTMLTableElement | null>): Record<string, number> {
  const [widths, setWidths] = useState<Record<string, number>>({});
  useLayoutEffect(() => {
    const table = tableRef.current;
    if (!table) return;
    const measure = () => {
      const measured: Record<string, number> = {};
      for (const header of table.querySelectorAll<HTMLTableCellElement>('th[data-column]'))
        measured[header.dataset.column!] = Math.round(header.getBoundingClientRect().width);
      setWidths((current) => (sameWidths(current, measured) ? current : measured));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(table);
    return () => observer.disconnect();
  }, [tableRef]);
  return widths;
}

function sameWidths(left: Record<string, number>, right: Record<string, number>): boolean {
  const keys = Object.keys(left);
  return keys.length === Object.keys(right).length && keys.every((key) => left[key] === right[key]);
}
