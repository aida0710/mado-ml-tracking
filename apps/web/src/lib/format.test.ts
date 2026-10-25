import { describe, expect, it } from 'vitest';
import { formatBytes, shortRunId } from './format';

describe('formatBytes', () => {
  it('今の表示言語の数の書き方で、1024で割った2進の単位にする', () => {
    expect(formatBytes(1023)).toBe('1023 B');
    expect(formatBytes(6.14697 * 1024 ** 2)).toBe('6.1 MiB');
  });
});

describe('shortRunId', () => {
  it('名前を読み込む前のRunを、UUIDの最初の区切りまでで示す', () => {
    expect(shortRunId('0f1e2d3c-4b5a-4968-8776-655443322110')).toBe('0f1e2d3c');
  });
});
