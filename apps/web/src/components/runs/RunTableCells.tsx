/**
 * How the Run list draws its cells, shared by the wide table (WideRunTable) and the narrow one
 * (NarrowRunTable): the selection checkboxes, the name and the description. runTableColumns.tsx
 * picks the cell of each column the saved view chose.
 */
import { useState, type CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import type { Run } from '@mmt/contracts';
import { MarkdownView } from '../markdown/MarkdownView';
import { descriptionSummary } from '../../lib/runColumns';
import { useLocale } from '../../i18n/useLocale';
import { text } from '../../i18n/catalog';

/** The selection the Run list shows and changes (RunTable builds it from the selected ids). */
export interface RunListSelection {
  isSelected: (runId: string) => boolean;
  areAllShownSelected: boolean;
  toggle: (runId: string) => void;
  setAllShown: (selected: boolean) => void;
}

/**
 * The first line of the description; the whole Markdown opens while hovered or focused. The
 * popover is fixed to the viewport because the table's scroll area would clip it.
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

/** The header checkbox: selects or clears every Run shown on this page. */
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
