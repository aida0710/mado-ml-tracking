import { useLayoutEffect, useState, type RefObject } from 'react';

/**
 * The drawn width of each column header (th[data-column]) of the table, by column key, kept current
 * as the table resizes. A column without a width the user set is as wide as its content, and its
 * resize handle still has to tell assistive technology how wide it is (aria-valuenow).
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
