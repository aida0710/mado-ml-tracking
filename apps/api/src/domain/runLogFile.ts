import type { LogEntry } from '@mmt/contracts';

// A Run's log as a downloaded file.
export const LOG_FILE_CONTENT_TYPE = 'text/plain; charset=utf-8';

/**
 * One line of the file: "time<TAB>LEVEL<TAB>message" as the Run recorded it (carriage returns
 * kept), so tools that read logs see every write.
 */
export function formatLogFileLine(entry: LogEntry): string {
  return `${entry.timestamp}\t${entry.level.toUpperCase()}\t${entry.message}\n`;
}

// Characters Windows and macOS refuse in file names, and control characters.
const UNSAFE_FILE_NAME_CHARACTERS = /[\\/:*?"<>|\u0000-\u001f]+/g;

export function logFileName(runName: string): string {
  const safeName = runName.replace(UNSAFE_FILE_NAME_CHARACTERS, '_').trim() || 'run';
  return `${safeName}.log`;
}
