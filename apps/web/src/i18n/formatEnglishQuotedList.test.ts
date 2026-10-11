import { afterEach, describe, expect, it } from 'vitest';
import { formatEnglishQuotedList } from './formatEnglishQuotedList';
import { setLocale } from './locale';

afterEach(() => setLocale('ja'));

describe('formatEnglishQuotedList', () => {
  it('quotes English names in English even while the screen is Japanese', () => {
    setLocale('ja');
    expect(formatEnglishQuotedList(['Qwen3', 'QWEN3'])).toBe('“Qwen3” and “QWEN3”');
    expect(formatEnglishQuotedList(['a', 'b', 'c'])).toBe('“a”, “b”, and “c”');
  });
});
