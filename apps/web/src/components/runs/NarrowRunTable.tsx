import type { Run, SavedViewColumn } from '@mmt/contracts';
import { ResponsiveTableView, type ResponsiveTableColumn } from '../ResponsiveTable';
import {
  RunNameCell,
  RunSelectCheckbox,
  shownRunColumns,
  ShownRunsCheckbox,
  type RunListSelection,
} from './RunTableCells';
import { useLocale } from '../../i18n/useLocale';
import { text } from '../../i18n/catalog';

// The saved view's columns that stay in a narrow row next to the selection and the name; the
// others open beneath the row, like every other list (ResponsiveTable).
const ROW_COLUMN_KEYS: ReadonlySet<string> = new Set(['status']);

/**
 * The Run list below --bp-sm: the selection, the name and the status in the row, and the rest of
 * the chosen columns behind the row's open button. Moving and resizing columns is left to wide
 * screens, where the chosen order and widths are drawn.
 */
export function NarrowRunTable({
  projectId,
  runs,
  columns,
  selection,
}: {
  projectId: string;
  runs: Run[];
  columns: SavedViewColumn[];
  selection: RunListSelection;
}) {
  useLocale();
  const tableColumns: ResponsiveTableColumn<Run>[] = [
    {
      key: 'select',
      header: <ShownRunsCheckbox selection={selection} />,
      render: (run) => <RunSelectCheckbox run={run} selection={selection} />,
      priority: 'primary',
      className: 'run-select-cell',
    },
    {
      key: 'name',
      header: text.runName,
      render: (run) => <RunNameCell projectId={projectId} run={run} />,
      priority: 'primary',
      className: 'run-name-cell',
    },
    ...shownRunColumns(columns).map(
      (column): ResponsiveTableColumn<Run> => ({
        key: column.key,
        header: column.label,
        render: column.render,
        priority: ROW_COLUMN_KEYS.has(column.key) ? 'primary' : 'secondary',
        className: column.className,
      }),
    ),
  ];
  return (
    <div className="narrow-run-table">
      <ResponsiveTableView
        columns={tableColumns}
        rows={runs}
        rowKey={(run) => run.id}
        isSelected={(run) => selection.isSelected(run.id)}
        isNarrow
      />
    </div>
  );
}
