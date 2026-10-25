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
 * 1ページ分のRunの一覧と、Runごとのチェックボックス。スマートフォン（640px未満）では主な列を
 * 行に残し、残りはほかの一覧と同じく行の下に開く（NarrowRunTable）。それより広い画面では
 * すべての列を出し、移動も幅の変更もできる（WideRunTable）。タブレット以上では、Runどうしの
 * メトリクスを横に並べて読めることが、表を横にスクロールする手間に見合う。900pxで切り替える
 * ほかの一覧には、その必要が無い。
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
  /** 選択と名前の列の後に、この順と幅で出す。 */
  columns: SavedViewColumn[];
  onColumnsChange: (columns: SavedViewColumn[]) => void;
  selectedIds: string[];
  onSelectedIdsChange: (ids: string[]) => void;
  /** ページにRunが無いとき、表の代わりに出す。理由と、次に何をすればよいか。 */
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
