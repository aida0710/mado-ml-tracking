import type { Run, SavedViewColumn } from '@mmt/contracts';
import { ResponsiveTableView, type ResponsiveTableColumn } from '../ResponsiveTable';
import {
  RunNameCell,
  RunSelectCheckbox,
  ShownRunsCheckbox,
  type RunListSelection,
} from './RunTableCells';
import { shownRunColumns } from './runTableColumns';
import { useLocale } from '../../i18n/useLocale';
import { text } from '../../i18n/catalog';

// 狭い行で選択と名前の隣に残す、保存ビューの列。ほかの列は、ほかの一覧と同じく行の下に
// 開く（ResponsiveTable）。
const ROW_COLUMN_KEYS: ReadonlySet<string> = new Set(['status']);

/**
 * 640px未満のRunの一覧。選択、名前、状態を行に出し、選んだ列の残りは行を開くボタンの奥に
 * 置く。列の移動と幅の変更は、選んだ順と幅で描く広い画面に任せる。
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
