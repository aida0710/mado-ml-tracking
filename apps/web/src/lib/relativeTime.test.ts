import { afterEach, describe, expect, it } from 'vitest';
import { formatRelativeTime } from './relativeTime';
import { setLocale } from '../i18n/locale';

const NOW = Date.parse('2026-10-08T12:00:00.000Z');

afterEach(() => setLocale('ja'));

describe('相対時刻', () => {
  it('今の表示言語で、経過時間に合う最も大きい単位で表す', () => {
    expect(formatRelativeTime('2026-10-08T11:59:30.000Z', NOW)).toBe('今');
    expect(formatRelativeTime('2026-10-08T11:55:00.000Z', NOW)).toBe('5分前');
    expect(formatRelativeTime('2026-10-07T11:00:00.000Z', NOW)).toBe('昨日');
    setLocale('en');
    expect(formatRelativeTime('2026-10-08T11:55:00.000Z', NOW)).toBe('5 minutes ago');
  });
});
