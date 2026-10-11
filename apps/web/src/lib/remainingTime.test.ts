import { describe, expect, it } from 'vitest';
import { formatRemainingTime } from './remainingTime';

describe('formatRemainingTime', () => {
  it('残り時間を日本語の単位で書く', () => {
    expect(formatRemainingTime(47)).toBe('47秒');
    expect(formatRemainingTime(65)).toBe('1分5秒');
    expect(formatRemainingTime(2 * 3600 + 3 * 60 + 9)).toBe('2時間3分');
  });
});
