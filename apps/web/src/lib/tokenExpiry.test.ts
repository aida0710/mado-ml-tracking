import { describe, expect, it } from 'vitest';
import { resolveTokenExpiryTimestamp, type TokenExpirySelection } from './tokenExpiry';

const now = Date.parse('2026-10-12T00:00:00Z');
const custom: TokenExpirySelection = { option: 'custom', duration: '1', unit: 'days' };

describe('API tokenの有効期間の指定', () => {
  it('無期限を選ぶとAPIへ明示的なnullを送る', () => {
    expect(resolveTokenExpiryTimestamp({ ...custom, option: 'never' }, now)).toBeNull();
  });
  it('プリセットは以前のカスタム入力に関係なく選んだ日数になる', () => {
    expect(resolveTokenExpiryTimestamp({ ...custom, option: '7', duration: '999', unit: 'minutes' }, now))
      .toBe('2026-10-19T00:00:00.000Z');
  });
  it.each([
    ['minutes', '30', '2026-10-12T00:30:00.000Z'],
    ['hours', '1.5', '2026-10-12T01:30:00.000Z'],
    ['days', '730', '2028-10-11T00:00:00.000Z'],
  ] as const)('任意の%s単位の期間%sを未来の日時へ変換する', (unit, duration, expiresAt) => {
    expect(resolveTokenExpiryTimestamp({ ...custom, unit, duration }, now)).toBe(expiresAt);
  });
  it.each(['', '0', '-1', 'NaN', 'Infinity', '100000000000000'])
    ('使用できない期間%sは発行前に拒否する', duration => {
      expect(resolveTokenExpiryTimestamp({ ...custom, duration }, now)).toBeUndefined();
    });
});
