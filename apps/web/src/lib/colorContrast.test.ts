import { describe, expect, it } from 'vitest';
import { contrastRatio, hslToRgb, parseHexColor, toHexColor } from './colorContrast';

describe('色のコントラスト', () => {
  it('白と黒は21:1、同じ色どうしは1:1になる', () => {
    expect(contrastRatio(parseHexColor('#ffffff'), parseHexColor('#000000'))).toBeCloseTo(21, 5);
    expect(contrastRatio(parseHexColor('#2a78d6'), parseHexColor('#2a78d6'))).toBe(1);
  });

  it('WCAG の例と同じ値になり、引数の順に依らない', () => {
    // #767676 on white is the usual 4.5:1 boundary gray.
    expect(contrastRatio(parseHexColor('#767676'), parseHexColor('#ffffff'))).toBeCloseTo(4.54, 2);
    expect(contrastRatio(parseHexColor('#ffffff'), parseHexColor('#767676'))).toBeCloseTo(4.54, 2);
  });

  it('HSL から求めた色を #rrggbb で返す', () => {
    expect(toHexColor(hslToRgb({ hue: 0, saturation: 1, lightness: 0.5 }))).toBe('#ff0000');
    expect(toHexColor(hslToRgb({ hue: 120, saturation: 1, lightness: 0.25 }))).toBe('#008000');
    expect(toHexColor(hslToRgb({ hue: 240, saturation: 0, lightness: 1 }))).toBe('#ffffff');
  });

  it('#rrggbb 以外は受け付けない', () => {
    expect(() => parseHexColor('#fff')).toThrow();
    expect(() => parseHexColor('rgb(0 0 0)')).toThrow();
  });
});
