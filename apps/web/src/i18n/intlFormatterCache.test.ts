import { afterEach, describe, expect, it } from 'vitest';
import { memoizePerIntlLocale } from './intlFormatterCache';
import { setLocale } from './locale';

afterEach(() => setLocale('ja'));

describe('memoizePerIntlLocale', () => {
  it('builds the formatter once per language and returns the one for the current display language', () => {
    const builtFor: string[] = [];
    const getFormat = memoizePerIntlLocale((intlLocale) => {
      builtFor.push(intlLocale);
      return new Intl.NumberFormat(intlLocale, { notation: 'compact' });
    });
    setLocale('ja');
    expect(getFormat().format(1_200_000)).toBe('120万');
    expect(getFormat().format(3_400_000)).toBe('340万');
    setLocale('en');
    expect(getFormat().format(1_200_000)).toBe('1.2M');
    setLocale('ja');
    expect(getFormat().format(1_200_000)).toBe('120万');
    expect(builtFor).toEqual(['ja-JP', 'en-US']);
  });

  it('gives the formatter of a fixed language when one is named', () => {
    setLocale('ja');
    const getFormat = memoizePerIntlLocale((intlLocale) => new Intl.NumberFormat(intlLocale, { notation: 'compact' }));
    expect(getFormat('en-US').format(1_200_000)).toBe('1.2M');
  });
});
