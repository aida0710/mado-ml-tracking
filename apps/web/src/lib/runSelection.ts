/**
 * Runの一覧の選択。idは一覧のページをまたいで保ち、見出しのチェックボックスはこのページに
 * 表示しているRunに対して働く。
 */

/** 1つのRunのチェックボックスを押した後の、選択中のid。 */
export function toggleRunSelection(selectedIds: readonly string[], runId: string): string[] {
  return selectedIds.includes(runId)
    ? selectedIds.filter((selected) => selected !== runId)
    : [...selectedIds, runId];
}

/** 見出しのチェックボックスで表示中のRunを選択または解除した後の、選択中のid。ほかはそのまま。 */
export function setShownRunsSelected(
  selectedIds: readonly string[],
  shownRunIds: readonly string[],
  selected: boolean,
): string[] {
  return selected
    ? Array.from(new Set([...selectedIds, ...shownRunIds]))
    : selectedIds.filter((id) => !shownRunIds.includes(id));
}

/** 見出しのチェックボックスがオンか。表示中のRunがすべて選択されていればオン。 */
export function areAllShownRunsSelected(
  selectedIds: readonly string[],
  shownRunIds: readonly string[],
): boolean {
  return shownRunIds.every((id) => selectedIds.includes(id));
}
