import { describe, expect, it } from 'vitest';
import type { LogEntry } from '@mmt/contracts';
import {
  displayedLogMessage,
  filterLogEntries,
  numberLogEntries,
  orderLogEntries,
} from './runLogText';

const entry = (message: string, level: LogEntry['level'] = 'info'): LogEntry => ({
  timestamp: '2026-10-11T05:00:01.000Z',
  level,
  message,
});

describe('ログの表示', () => {
  it('\\rで上書きした進捗バーは、最後に書いた内容だけを出す', () => {
    expect(displayedLogMessage(' 10%|#  |\r 50%|##### |\r100%|##########|\r')).toBe(
      '100%|##########|',
    );
    expect(displayedLogMessage('plain line')).toBe('plain line');
  });

  it('読んだ行には全体の中の行番号が付き、最新の行の窓がずれても同じ行は同じ番号になる', () => {
    const before = numberLogEntries({ items: [entry('c'), entry('d')], totalCount: 4 });
    const after = numberLogEntries({ items: [entry('d'), entry('e')], totalCount: 5 });
    expect(before.map(({ lineNumber, entry: line }) => [lineNumber, line.message])).toEqual([
      [2, 'c'],
      [3, 'd'],
    ]);
    expect(after[0]).toEqual({ lineNumber: 3, entry: entry('d') });
  });

  it('レベルと検索語（大文字小文字を区別しない）で絞り込む', () => {
    const lines = numberLogEntries({
      items: [
        entry('Epoch 1 done'),
        entry('Traceback (most recent call last):', 'error'),
        entry('CUDA out of memory', 'error'),
      ],
      totalCount: 3,
    });
    expect(filterLogEntries(lines, { level: 'error', search: 'cuda' })).toEqual([lines[2]]);
    expect(filterLogEntries(lines, { level: '', search: '  ' })).toHaveLength(3);
  });

  it('新しい順では最新の行が先頭に来る', () => {
    const entries = [entry('first'), entry('last')];
    expect(orderLogEntries(entries, 'newestFirst').map((item) => item.message)).toEqual([
      'last',
      'first',
    ]);
    expect(orderLogEntries(entries, 'oldestFirst')).toEqual(entries);
  });
});
