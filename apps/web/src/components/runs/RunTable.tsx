import type { Run, SavedViewColumn } from '@mmt/contracts';
import { Empty } from '../Feedback';
import { narrowerThan } from '../../lib/breakpoints';
import { useMediaQuery } from '../../lib/useMediaQuery';
import {
  areAllShownRunsSelected,
  setShownRunsSelected,
  toggleRunSelection,
} from '../../lib/runSelection';
import { NarrowRunTable } from './NarrowRunTable';
import { WideRunTable } from './WideRunTable';
import type { RunListSelection } from './RunTableCells';
import { text } from '../../i18n/catalog';

/**
 * The Run list of a page of Runs, with a checkbox per Run. On phones (below --bp-sm) it keeps the
 * main columns in the row and opens the rest beneath it (NarrowRunTable), like the other lists.
 * Wider screens show every column, movable and resizable (WideRunTable): from a tablet up, reading
 * metrics across Runs side by side is worth scrolling the table sideways, which the other lists,
 * switching at --bp-md, do not need.
 */
export function RunTable({
  projectId,
  runs,
  columns,
  onColumnsChange,
  selectedIds,
  onSelectedIdsChange,
}: {
  projectId: string;
  runs: Run[];
  /** Shown after the selection and name columns, in this order and width. */
  columns: SavedViewColumn[];
  onColumnsChange: (columns: SavedViewColumn[]) => void;
  selectedIds: string[];
  onSelectedIdsChange: (ids: string[]) => void;
}) {
  const isPhone = useMediaQuery(narrowerThan('sm'));
  if (!runs.length) return <Empty>{text.noResults}</Empty>;

  const shownRunIds = runs.map((run) => run.id);
  const selection: RunListSelection = {
    isSelected: (runId) => selectedIds.includes(runId),
    areAllShownSelected: areAllShownRunsSelected(selectedIds, shownRunIds),
    toggle: (runId) => onSelectedIdsChange(toggleRunSelection(selectedIds, runId)),
    setAllShown: (selected) =>
      onSelectedIdsChange(setShownRunsSelected(selectedIds, shownRunIds, selected)),
  };
  return isPhone ? (
    <NarrowRunTable projectId={projectId} runs={runs} columns={columns} selection={selection} />
  ) : (
    <WideRunTable
      projectId={projectId}
      runs={runs}
      columns={columns}
      onColumnsChange={onColumnsChange}
      selection={selection}
    />
  );
}
