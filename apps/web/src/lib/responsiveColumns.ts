/**
 * 表の列の重要度。primaryの列は狭い画面でも表示し、secondaryは広い画面でだけ、detail（合否基準
 * のような長い文）は開いた行の中でだけ表示する。
 */
export type ColumnPriority = 'primary' | 'secondary' | 'detail';

/**
 * 列を、行に出すものと、行を開いたときだけ出すものに分ける。広い画面ではdetail以外のすべての
 * 列を出し、狭い画面ではprimaryの列を行に残す。primaryの列が無い表は、狭い画面の行が空に
 * ならないよう最初の列を残す。
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
