import { describe, expect, it } from 'vitest';
import { changeTokenExpiryOption, resolveTokenExpiryTimestamp, type TokenExpirySelection } from './tokenExpiry';
import { formatLocalDateTimeInput } from './dateTimeInput';

const now = Date.parse('2026-10-12T00:00:00Z');
const custom: TokenExpirySelection = { option: 'custom', duration: '1', unit: 'days', dateTime: '' };

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
  it.each(['', '0', '-1', 'NaN', 'Infinity', '100000000000000'])('使用できない期間%sは発行前に拒否する', duration => {
    expect(resolveTokenExpiryTimestamp({ ...custom, duration }, now)).toBeUndefined();
  });
  it('カレンダーの日時はブラウザの現地時刻としてAPIのUTC日時へ変換する', () => {
    expect(resolveTokenExpiryTimestamp({ ...custom, option: 'calendar', dateTime: '2046-10-12T16:30' }, now))
      .toBe(new Date(2046, 9, 12, 16, 30).toISOString());
  });
  it.each(['', '2000-01-01T00:00', '2046-02-30T12:00', '2046-10-12T25:00', 'invalid'])('過去・存在しないカレンダーの日時%sは発行前に拒否する', dateTime => {
    expect(resolveTokenExpiryTimestamp({ ...custom, option: 'calendar', dateTime }, now)).toBeUndefined();
  });
  it('カレンダーへ切り替えると既に選んだ有効期間の期限が入る', () => {
    const selection = changeTokenExpiryOption({ ...custom, option: '7' }, 'calendar', now);
    expect(selection.dateTime).toBe(formatLocalDateTimeInput(new Date('2026-10-19T00:00:00Z')));
  });
  it('一度選んだ日時は無期限とカレンダーを切り替えても保持する', () => {
    const selection = { ...custom, option: 'calendar' as const, dateTime: '2046-10-12T16:30' };
    const unlimited = changeTokenExpiryOption(selection, 'never', now);
    expect(resolveTokenExpiryTimestamp(unlimited, now)).toBeNull();
    expect(changeTokenExpiryOption(unlimited, 'calendar', now).dateTime).toBe(selection.dateTime);
  });
});
