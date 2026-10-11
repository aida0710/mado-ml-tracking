import { useLocale } from '../i18n/useLocale';
import { useLayoutEffect, useRef, useState } from 'react';
import { ArrowDownToLine, Download } from 'lucide-react';
import { MAX_RUN_LOG_TAIL, type LogEntry, type RunLogList } from '@mmt/contracts';
import { Empty, Resource } from './Feedback';
import type { RunLogsState } from '../hooks/useRunLogs';
import { formatDateTimeSeconds } from '../lib/format';
import {
  displayedLogMessage,
  filterLogEntries,
  numberLogEntries,
  orderLogEntries,
  type LogOrder,
  type LogViewFilter,
} from '../lib/runLogText';
import { text } from '../i18n/catalog';
import { jobsTextTemplates, logLevelLabels } from '../i18n/jobs';

// Within this many pixels of the newest line, the view keeps following new lines.
const FOLLOW_LATEST_DISTANCE_PX = 24;
const LOG_LEVELS = ['info', 'warning', 'error'] as const;

/**
 * A Run's log: the latest lines (more of them on request), filtered by level and words, oldest or
 * newest first. It opens at the newest line and follows new ones while the reader stays there;
 * [最新へ] returns to it. The download always holds every line.
 */
export function RunLogs({ logs }: { logs: RunLogsState }) {
  useLocale();
  const [filter, setFilter] = useState<LogViewFilter>({ level: '', search: '' });
  const [order, setOrder] = useState<LogOrder>('oldestFirst');
  const changeFilter = (next: Partial<LogViewFilter>) =>
    setFilter((previous) => ({ ...previous, ...next }));
  return (
    <>
      <div className="log-toolbar">
        <label className="chart-selector">
          <span>{text.logsLevel}</span>
          <select
            aria-label={text.logsLevel}
            value={filter.level}
            onChange={(event) =>
              changeFilter({ level: event.target.value as LogViewFilter['level'] })
            }
          >
            <option value="">{text.logLevelAll}</option>
            {LOG_LEVELS.map((value) => (
              <option key={value} value={value}>
                {logLevelLabels[value]}
              </option>
            ))}
          </select>
        </label>
        <label className="chart-selector">
          <span>{text.logsOrder}</span>
          <select
            aria-label={text.logsOrder}
            value={order}
            onChange={(event) => setOrder(event.target.value as LogOrder)}
          >
            <option value="oldestFirst">{text.logsOldestFirst}</option>
            <option value="newestFirst">{text.logsNewestFirst}</option>
          </select>
        </label>
        <input
          type="search"
          className="log-search"
          aria-label={text.logsSearch}
          placeholder={text.logsSearchPlaceholder}
          value={filter.search}
          onChange={(event) => changeFilter({ search: event.target.value })}
        />
        {logs.downloadUrl && (
          // The API streams every line into the file, however long the log is.
          <a className="button small" href={logs.downloadUrl} download>
            <Download size={14} />
            {text.logsDownload}
          </a>
        )}
      </div>
      <Resource query={logs.lines}>
        {(list) => <LogLines list={list} filter={filter} order={order} logs={logs} />}
      </Resource>
    </>
  );
}

function LogLines({
  list,
  filter,
  order,
  logs,
}: {
  list: RunLogList;
  filter: LogViewFilter;
  order: LogOrder;
  logs: RunLogsState;
}) {
  useLocale();
  const view = useRef<HTMLDivElement>(null);
  // Starts at the newest line; scrolling away stops following until [最新へ].
  const followsLatest = useRef(true);
  const shown = orderLogEntries(filterLogEntries(numberLogEntries(list), filter), order);
  const isFiltered = Boolean(filter.level || filter.search.trim());
  const scrollToLatest = () => {
    const element = view.current;
    if (!element) return;
    element.scrollTop = order === 'newestFirst' ? 0 : element.scrollHeight;
    followsLatest.current = true;
  };
  useLayoutEffect(() => {
    if (followsLatest.current) scrollToLatest();
  });
  if (!list.items.length) return <Empty>{text.noLogs}</Empty>;
  const hidesOlderLines = list.totalCount > list.items.length;
  return (
    <>
      <div className="log-status">
        {hidesOlderLines && (
          <span className="muted">
            {jobsTextTemplates.logsShowingLatest(list.items.length, list.totalCount)}{' '}
            {!logs.readsMoreLines && (
              <button type="button" className="link-button" onClick={logs.readMoreLines}>
                {list.totalCount <= MAX_RUN_LOG_TAIL
                  ? text.logsReadAll
                  : jobsTextTemplates.logsReadLatestLines(MAX_RUN_LOG_TAIL)}
              </button>
            )}
          </span>
        )}
        {logs.readsMoreLines && logs.isLive && (
          <span className="muted">
            {text.logsUpdatesPaused}{' '}
            <button type="button" className="link-button" onClick={logs.lines.reload}>
              {text.logsReadNewLines}
            </button>{' '}
            <button type="button" className="link-button" onClick={logs.followLatestLines}>
              {text.logsFollowLatest}
            </button>
          </span>
        )}
        {isFiltered && (
          <span className="muted">{jobsTextTemplates.logsMatchCount(shown.length)}</span>
        )}
        <button type="button" className="button small log-latest" onClick={scrollToLatest}>
          <ArrowDownToLine size={14} />
          {text.logsJumpToLatest}
        </button>
      </div>
      {shown.length ? (
        <div
          ref={view}
          className="log-view"
          role="log"
          aria-label={text.logs}
          // Focusable, so the keyboard scrolls the lines (axe scrollable-region-focusable).
          tabIndex={0}
          onScroll={(event) => {
            const element = event.currentTarget;
            const distance =
              order === 'newestFirst'
                ? element.scrollTop
                : element.scrollHeight - element.clientHeight - element.scrollTop;
            followsLatest.current = distance <= FOLLOW_LATEST_DISTANCE_PX;
          }}
        >
          {shown.map(({ lineNumber, entry }) => (
            <LogLine entry={entry} key={lineNumber} />
          ))}
        </div>
      ) : (
        <Empty>{text.logsNoMatch}</Empty>
      )}
    </>
  );
}

function LogLine({ entry }: { entry: LogEntry }) {
  useLocale();
  return (
    <div className={`log-entry log-${entry.level}`}>
      <time dateTime={entry.timestamp}>{formatDateTimeSeconds(entry.timestamp)}</time>
      <span className="log-level">{logLevelLabels[entry.level] ?? entry.level}</span>
      <span>{displayedLogMessage(entry.message)}</span>
    </div>
  );
}
