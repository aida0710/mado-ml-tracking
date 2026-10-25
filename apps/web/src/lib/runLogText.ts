import type { LogEntry, RunLogList } from '@mmt/contracts';

/** ログの表示に出す行の条件。レベルと、メッセージに含む語。 */
export interface LogViewFilter {
  level: LogEntry['level'] | '';
  search: string;
}

export type LogOrder = 'oldestFirst' | 'newestFirst';

/**
 * 復帰文字で書いた行（tqdmの進捗バーは`\r`で自分を描き直す）を端末が表示する内容。最後の`\r`の
 * 後ろの文字列。末尾の`\r`は書き込みの終わりなので無視する。
 */
export function displayedLogMessage(message: string): string {
  const withoutTrailing = message.replace(/\r+$/, '');
  const lastReturn = withoutTrailing.lastIndexOf('\r');
  return lastReturn < 0 ? withoutTrailing : withoutTrailing.slice(lastReturn + 1);
}

/** 読んだ1行と、Runのログ全体の中での位置（0がRunの最初の行）。 */
export interface NumberedLogEntry {
  lineNumber: number;
  entry: LogEntry;
}

/**
 * 読んだ行に、ログ全体の中での位置で番号を振る。この番号は最新の行の範囲が動いても変わらない
 * ので、これをキーにした表示はすでに出している行を保てる。
 */
export function numberLogEntries(list: RunLogList): NumberedLogEntry[] {
  const firstLineNumber = list.totalCount - list.items.length;
  return list.items.map((entry, index) => ({ lineNumber: firstLineNumber + index, entry }));
}

/** レベルが合い、検索の語を含む行（大文字と小文字を区別しない）。 */
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
