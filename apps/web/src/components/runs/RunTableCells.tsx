/**
 * Runの一覧のセルの描き方。広い表（WideRunTable）と狭い表（NarrowRunTable）で共有する。
 * 選択のチェックボックス、名前、説明。各列にどのセルを使うかは、保存ビューが選んだ列に応じて
 * runTableColumns.tsxが決める。
 */
import { useState, type CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import type { Run } from '@mmt/contracts';
import { MarkdownView } from '../markdown/MarkdownView';
import { descriptionSummary } from '../../lib/runColumns';
import { useLocale } from '../../i18n/useLocale';
import { text } from '../../i18n/catalog';

/** Runの一覧が出して変える選択（選んだidからRunTableが作る）。 */
export interface RunListSelection {
  isSelected: (runId: string) => boolean;
  areAllShownSelected: boolean;
  toggle: (runId: string) => void;
  setAllShown: (selected: boolean) => void;
}

/**
 * 説明の1行目。ホバーかフォーカスの間、Markdownの全文を開く。表のスクロール領域に切り取られる
 * ので、ポップオーバーはビューポートに固定する。
 */
export function RunDescriptionCell({ description }: { description: string }) {
  useLocale();
  const [popoverPosition, setPopoverPosition] = useState<CSSProperties | null>(null);
  if (!description.trim()) return null;
  const open = (cell: HTMLElement) => {
    const rect = cell.getBoundingClientRect();
    setPopoverPosition({ top: rect.bottom + 4, left: rect.left });
  };
  return (
    <span
      className="run-description-cell"
      tabIndex={0}
      onMouseEnter={(event) => open(event.currentTarget)}
      onMouseLeave={() => setPopoverPosition(null)}
      onFocus={(event) => open(event.currentTarget)}
      onBlur={() => setPopoverPosition(null)}
    >
      <span className="run-description-summary">{descriptionSummary(description)}</span>
      {popoverPosition && (
        <span className="run-description-popover" role="tooltip" style={popoverPosition}>
          <MarkdownView source={description} />
        </span>
      )}
    </span>
  );
}

/** 見出しのチェックボックス。このページに出ている全Runを選ぶか外す。 */
export function ShownRunsCheckbox({ selection }: { selection: RunListSelection }) {
  useLocale();
  return (
    <label className="run-select-target">
      <input
        type="checkbox"
        aria-label={text.selectAll}
        checked={selection.areAllShownSelected}
        onChange={(event) => selection.setAllShown(event.target.checked)}
      />
    </label>
  );
}

export function RunSelectCheckbox({ run, selection }: { run: Run; selection: RunListSelection }) {
  useLocale();
  return (
    <label className="run-select-target">
      <input
        type="checkbox"
        aria-label={`${text.selectRun}: ${run.name}`}
        checked={selection.isSelected(run.id)}
        onChange={() => selection.toggle(run.id)}
      />
    </label>
  );
}

export function RunNameCell({ projectId, run }: { projectId: string; run: Run }) {
  useLocale();
  return (
    <Link className="run-name" title={run.name} to={`/projects/${projectId}/runs/${run.id}`}>
      {run.name}
    </Link>
  );
}
