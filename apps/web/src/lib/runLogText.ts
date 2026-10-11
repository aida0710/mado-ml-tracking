import type { LogEntry, RunLogList } from '@mmt/contracts';

/** Which lines the log view shows: a level, words in the message, and which end comes first. */
export interface LogViewFilter {
  level: LogEntry['level'] | '';
  search: string;
}

export type LogOrder = 'oldestFirst' | 'newestFirst';

/**
 * What a terminal shows for a line written with carriage returns (a tqdm progress bar redraws
 * itself with `\r`): the text after the last one. A trailing `\r` ends a write and is ignored.
 */
export function displayedLogMessage(message: string): string {
  const withoutTrailing = message.replace(/\r+$/, '');
  const lastReturn = withoutTrailing.lastIndexOf('\r');
  return lastReturn < 0 ? withoutTrailing : withoutTrailing.slice(lastReturn + 1);
}

/** A read line and its place in the Run's whole log (0 is the Run's first line). */
export interface NumberedLogEntry {
  lineNumber: number;
  entry: LogEntry;
}

/**
 * Numbers the read lines by their place in the whole log, which stays the same as the window of
 * latest lines moves, so a view keyed by it keeps the lines it already shows.
 */
export function numberLogEntries(list: RunLogList): NumberedLogEntry[] {
  const firstLineNumber = list.totalCount - list.items.length;
  return list.items.map((entry, index) => ({ lineNumber: firstLineNumber + index, entry }));
}

/** The lines that match the level and contain the search words (case-insensitive). */
export function filterLogEntries(
  lines: readonly NumberedLogEntry[],
  filter: LogViewFilter,
): NumberedLogEntry[] {
  const search = filter.search.trim().toLocaleLowerCase();
  return lines.filter(
    ({ entry }) =>
      (!filter.level || entry.level === filter.level) &&
      (!search || displayedLogMessage(entry.message).toLocaleLowerCase().includes(search)),
  );
}

export function orderLogEntries<Line>(lines: readonly Line[], order: LogOrder): Line[] {
  return order === 'newestFirst' ? [...lines].reverse() : [...lines];
}
