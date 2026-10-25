import type { LogEntry } from '@mmt/contracts';

// Runのログをダウンロードするファイルにしたもの。
export const LOG_FILE_CONTENT_TYPE = 'text/plain; charset=utf-8';

/**
 * ファイルの1行。Runが記録したとおりの"time<TAB>LEVEL<TAB>message"で（復帰文字も残す）、
 * ログを読む道具がすべての書き込みを見られるようにする。
 */
export function formatLogFileLine(entry: LogEntry): string {
  return `${entry.timestamp}\t${entry.level.toUpperCase()}\t${entry.message}\n`;
}

// WindowsとmacOSがファイル名に使えない文字と、制御文字。
// eslint-disable-next-line no-control-regex -- 置き換える文字に制御文字が含まれる
const UNSAFE_FILE_NAME_CHARACTERS = /[\\/:*?"<>|\u0000-\u001f]+/g;

export function logFileName(runName: string): string {
  const safeName = runName.replace(UNSAFE_FILE_NAME_CHARACTERS, '_').trim() || 'run';
  return `${safeName}.log`;
}
