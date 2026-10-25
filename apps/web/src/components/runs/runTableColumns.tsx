/** 保存ビューが選んだRunの一覧の列と、各列の描き方。 */
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

/** 保存ビューの列と、その描き方。 */
export interface ShownRunColumn extends RunColumn {
  key: string;
  /** 利用者がドラッグして決めた列の幅。undefinedなら中身に合わせる。 */
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

/** 移動できる列のキーの描き方。新しいクライアントが作った知らないキーは飛ばす。 */
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
  // 説明には専用の列がある。タグとして出すと、生のMarkdownで行が埋まってしまう。
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

/** 保存ビューの列のうち、このクライアントが描けるもの。その順と幅で並べる。 */
export function shownRunColumns(columns: readonly SavedViewColumn[]): ShownRunColumn[] {
  return columns.flatMap((column) => {
    const definition = runColumn(column.key);
    return definition ? [{ ...definition, key: column.key, width: column.width }] : [];
  });
}
