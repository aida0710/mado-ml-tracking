/** The columns of the Run list that the saved view chose, and how each one is drawn. */
import type { ReactNode } from 'react';
import { RUN_NOTE_TAG, type Run, type SavedViewColumn } from '@mmt/contracts';
import { RunStatusBadge } from './RunStatusBadge';
import { RunDescriptionCell } from './RunTableCells';
import { creatorName } from '../../lib/creatorName';
import { CompactValue } from '../CompactValue';
import { getRunParameters } from '../../lib/runParameters';
import { formatDate, formatDuration } from '../../lib/format';
import { RUN_DESCRIPTION_COLUMN } from '../../lib/runColumns';
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
