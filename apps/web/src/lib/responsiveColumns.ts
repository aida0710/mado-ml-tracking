/**
 * How important a table column is: primary columns stay visible on narrow screens, secondary ones
 * show on wide screens only, and detail ones (long text, such as criteria) only in an opened row.
 */
export type ColumnPriority = 'primary' | 'secondary' | 'detail';

/**
 * Splits columns into those shown in the row and those shown only when a row is opened. Wide
 * screens show every column but the detail ones; narrow screens keep the primary ones in the row.
 * A table with no primary column keeps its first column so a narrow row is never empty.
 */
export function splitColumnsByPriority<T extends { priority: ColumnPriority }>(
  columns: readonly T[],
  isNarrow: boolean,
) {
  const hasPrimary = columns.some((column) => column.priority === 'primary');
  const staysInRow = (column: T, index: number) => {
    if (column.priority === 'detail') return false;
    if (!isNarrow) return true;
    return hasPrimary ? column.priority === 'primary' : index === 0;
  };
  return {
    rowColumns: columns.filter(staysInRow),
    detailColumns: columns.filter((column, index) => !staysInRow(column, index)),
  };
}
