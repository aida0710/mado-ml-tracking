/**
 * The Run list's selection: the ids stay across pages of the list, while the header checkbox acts on
 * the Runs shown on this page.
 */

/** The selected ids after one Run's checkbox is clicked. */
export function toggleRunSelection(selectedIds: readonly string[], runId: string): string[] {
  return selectedIds.includes(runId)
    ? selectedIds.filter((selected) => selected !== runId)
    : [...selectedIds, runId];
}

/** The selected ids after the header checkbox selects or clears the shown Runs; others stay. */
export function setShownRunsSelected(
  selectedIds: readonly string[],
  shownRunIds: readonly string[],
  selected: boolean,
): string[] {
  return selected
    ? Array.from(new Set([...selectedIds, ...shownRunIds]))
    : selectedIds.filter((id) => !shownRunIds.includes(id));
}

/** Whether the header checkbox is checked: every shown Run is selected. */
export function areAllShownRunsSelected(
  selectedIds: readonly string[],
  shownRunIds: readonly string[],
): boolean {
  return shownRunIds.every((id) => selectedIds.includes(id));
}
