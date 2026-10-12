import { describe, expect, it } from 'vitest';
import { resolveTokenExpiry } from './tokenExpiry.js';

const now = new Date('2026-10-12T00:00:00Z');
const request = { now, defaultLifetimeDays: 365 };

describe('API tokenの有効期限', () => {
  it('nullを明示すると無期限になる', () => {
    expect(resolveTokenExpiry({ ...request, expiresAt: null })).toBeNull();
  });
  it('期限を省略すると設定された日数後になる', () => {
    expect(resolveTokenExpiry({ ...request, expiresAt: undefined, defaultLifetimeDays: 30 }))
      .toEqual(new Date('2026-11-11T00:00:00Z'));
  });
  it('既定の日数を超える未来の期限もそのまま使える', () => {
    expect(resolveTokenExpiry({ ...request, expiresAt: '2046-10-12T00:00:00Z' }))
      .toEqual(new Date('2046-10-12T00:00:00Z'));
  });
  it.each(['2026-10-11T00:00:00Z', now.toISOString(), '', 'invalid'])
    ('過去・現在・無効な期限%sは拒否する', expiresAt => {
      expect(() => resolveTokenExpiry({ ...request, expiresAt }))
        .toThrow(expect.objectContaining({ status: 422, code: 'invalid_expiry' }));
    });
});
