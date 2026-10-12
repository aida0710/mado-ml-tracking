import { afterEach, describe, expect, it } from 'vitest';
import { formatEnglishQuotedList } from './formatEnglishQuotedList';
import { setLocale } from './locale';

afterEach(() => setLocale('ja'));

describe('formatEnglishQuotedList', () => {
  it('日本語の画面でも、英語の書き方で名前を引用して並べる', () => {
    setLocale('ja');
    expect(formatEnglishQuotedList(['Qwen3', 'QWEN3'])).toBe('“Qwen3” and “QWEN3”');
    expect(formatEnglishQuotedList(['a', 'b', 'c'])).toBe('“a”, “b”, and “c”');
  });
});
