import type { ReactNode } from 'react';
import type { Run, SavedViewColumn } from '@mmt/contracts';
import { Empty } from '../Feedback';
import { narrowerThan } from '@mado/design-system/layout';
import { useMediaQuery } from '@mado/design-system/react';
import {
  areAllShownRunsSelected,
  setShownRunsSelected,
  toggleRunSelection,
} from '../../lib/runSelection';
import { NarrowRunTable } from './NarrowRunTable';
import { WideRunTable } from './WideRunTable';
import type { RunListSelection } from './RunTableCells';
import { useLocale } from '../../i18n/useLocale';
import { text } from '../../i18n/catalog';

/**
 * The Run list of a page of Runs, with a checkbox per Run. On phones (below 640px) it keeps the
 * main columns in the row and opens the rest beneath it (NarrowRunTable), like the other lists.
 * Wider screens show every column, movable and resizable (WideRunTable): from a tablet up, reading
 * metrics across Runs side by side is worth scrolling the table sideways, which the other lists,
 * switching at 900px, do not need.
 */
export function RunTable({
  projectId,
  runs,
  columns,
  onColumnsChange,
  selectedIds,
  onSelectedIdsChange,
  empty = text.noResults,
}: {
  projectId: string;
  runs: Run[];
  /** Shown after the selection and name columns, in this order and width. */
  columns: SavedViewColumn[];
  onColumnsChange: (columns: SavedViewColumn[]) => void;
  selectedIds: string[];
  onSelectedIdsChange: (ids: string[]) => void;
  /** Shown instead of the table when the page has no Runs: why, and what to do next. */
  empty?: ReactNode;
}) {
  useLocale();
  const isPhone = useMediaQuery(narrowerThan('sm'));
  if (!runs.length) return <Empty>{empty}</Empty>;

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
