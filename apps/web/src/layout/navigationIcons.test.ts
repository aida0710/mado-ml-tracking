import { describe, expect, it } from 'vitest';
import { NAVIGATION_ICONS } from './navigationIcons';

describe('ナビゲーションの印', () => {
  it('画面ごとに別の印にし、印だけの細い表示でも見分けられる', () => {
    const icons = Object.values(NAVIGATION_ICONS);
    expect(new Set(icons).size).toBe(icons.length);
  });
});
