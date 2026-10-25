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
import { useLocale } from '../i18n/useLocale';
import { text } from '../i18n/catalog';
import { jobsTextTemplates, logLevelLabels } from '../i18n/jobs';

// 最新の行からこのピクセル数以内にいる間は、新しい行を追い続ける。
const FOLLOW_LATEST_DISTANCE_PX = 24;
const LOG_LEVELS = ['info', 'warning', 'error'] as const;

/**
 * Runのログ。最新の行（求めればもっと前まで）を、レベルと語で絞り込み、古い順か新しい順に並べる。
 * 開いたときは最新の行にいて、読み手がそこにいる間は新しい行を追う。［最新へ］でそこへ戻る。
 * ダウンロードには常にすべての行が入る。
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
          // ログがどれほど長くても、APIがすべての行をファイルへ流し込む。
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
  // 最新の行から始める。スクロールして離れると、［最新へ］を押すまで追うのをやめる。
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
          // キーボードで行をスクロールできるよう、フォーカスを受けられるようにする
          // （axeのscrollable-region-focusable）。
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
