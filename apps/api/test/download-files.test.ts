import { describe, expect, it } from 'vitest';
import { attachmentDisposition } from '../src/http/attachmentDisposition.js';
import { formatLogFileLine, logFileName } from '../src/domain/runLogFile.js';

describe('ダウンロードするファイル', () => {
  it('添付ファイル名は日本語をRFC 5987で、ASCIIの代替名は記号を置き換えて渡す', () => {
    expect(attachmentDisposition('runs-20261008.csv')).toBe(
      `attachment; filename="runs-20261008.csv"; filename*=UTF-8''runs-20261008.csv`,
    );
    expect(attachmentDisposition('比較"a".csv')).toBe(
      `attachment; filename="___a_.csv"; filename*=UTF-8''${encodeURIComponent('比較"a".csv')}`,
    );
  });

  it('logの1行は記録したままの本文を、時刻・レベル・本文のタブ区切りで書く', () => {
    expect(
      formatLogFileLine({ timestamp: '2026-10-11T05:00:01.000Z', level: 'error', message: 'a\rb' }),
    ).toBe('2026-10-11T05:00:01.000Z\tERROR\ta\rb\n');
  });

  it('logのファイル名は、使えない文字をRun名から外す', () => {
    expect(logFileName('train: lr/0.1')).toBe('train_ lr_0.1.log');
    expect(logFileName('')).toBe('run.log');
  });
});
