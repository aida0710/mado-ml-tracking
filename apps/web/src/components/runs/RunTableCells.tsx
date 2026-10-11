/**
 * How the Run list draws its cells, shared by the wide table (WideRunTable) and the narrow one
 * (NarrowRunTable): the selection checkboxes, the name, and each column the saved view chose.
 */
import { useState, type CSSProperties, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { RUN_NOTE_TAG, type Run, type SavedViewColumn } from '@mmt/contracts';
import { RunStatusBadge } from './RunStatusBadge';
import { creatorName } from '../../lib/creatorName';
import { CompactValue } from '../CompactValue';
import { MarkdownView } from '../markdown/MarkdownView';
import { getRunParameters } from '../../lib/runParameters';
import { formatDate, formatDuration } from '../../lib/format';
import { descriptionSummary, RUN_DESCRIPTION_COLUMN } from '../../lib/runColumns';
import { text } from '../../i18n/catalog';

interface RunColumn {
  label: ReactNode;
  render: (run: Run) => ReactNode;
  className?: string;
}

/** A column of the saved view with how it is drawn. */
export interface ShownRunColumn extends RunColumn {
  key: string;
  /** The width the user dragged the column to; undefined fits the content. */
  width?: number;
}

/** The selection the Run list shows and changes (RunTable builds it from the selected ids). */
export interface RunListSelection {
  isSelected: (runId: string) => boolean;
  areAllShownSelected: boolean;
  toggle: (runId: string) => void;
  setAllShown: (selected: boolean) => void;
}

const groupLabel = (group: string, name: string) => (
  <>
    <small>{group}</small>
    <span className="run-column-name" title={name}>
      {name}
    </span>
  </>
);

/** How a movable column key is drawn; unknown keys from a newer client are skipped. */
function runColumn(key: string): RunColumn | null {
  const [group, ...rest] = key.split('.');
  const name = rest.join('.');
  if (group === 'metrics' && name)
    return {
      label: groupLabel(text.metrics, name),
      render: (run) => <CompactValue value={run.latestMetrics[name]} />,
      className: 'mono numeric',
    };
  if (group === 'params' && name)
    return {
      label: groupLabel(text.parameters, name),
      render: (run) => <CompactValue value={getRunParameters(run)[name]} />,
      className: 'mono',
    };
  // The description has its own column; as a tag it would fill the row with raw Markdown.
  if (group === 'tags' && name && name !== RUN_NOTE_TAG)
    return {
      label: groupLabel(text.tags, name),
      render: (run) => <CompactValue value={run.tags[name]} />,
      className: 'mono',
    };
  switch (key) {
    case 'status':
      return { label: text.status, render: (run) => <RunStatusBadge run={run} /> };
    case 'created':
      return { label: text.created, render: (run) => formatDate(run.createdAt), className: 'nowrap' };
    case 'duration':
      return {
        label: text.duration,
        render: (run) => formatDuration(run.startedAt, run.endedAt),
        className: 'mono nowrap',
      };
    case 'user':
      return {
        label: text.user,
        render: (run) => (
          <span className="run-user" title={run.createdBy}>
            {creatorName(run)}
          </span>
        ),
      };
    case 'kind':
      return { label: text.kind, render: (run) => text[run.kind], className: 'nowrap' };
    case RUN_DESCRIPTION_COLUMN:
      return {
        label: text.runDescriptionColumn,
        render: (run) => <RunDescriptionCell description={run.tags[RUN_NOTE_TAG] ?? ''} />,
      };
    default:
      return null;
  }
}

/** The saved view's columns this client knows how to draw, in their order and width. */
export function shownRunColumns(columns: readonly SavedViewColumn[]): ShownRunColumn[] {
  return columns.flatMap((column) => {
    const definition = runColumn(column.key);
    return definition ? [{ ...definition, key: column.key, width: column.width }] : [];
  });
}

/**
 * The first line of the description; the whole Markdown opens while hovered or focused. The
 * popover is fixed to the viewport because the table's scroll area would clip it.
 */
function RunDescriptionCell({ description }: { description: string }) {
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
  return (
    <Link className="run-name" title={run.name} to={`/projects/${projectId}/runs/${run.id}`}>
      {run.name}
    </Link>
  );
}
