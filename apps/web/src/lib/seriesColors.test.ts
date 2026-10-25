import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import { contrastRatio, parseHexColor } from './colorContrast';
import { CHART_BACKGROUND_COLORS, distinctSeriesStyles, type ChartTheme } from './seriesColors';

const THEMES: ChartTheme[] = ['light', 'dark'];
const runIds = (count: number) => Array.from({ length: count }, (_, index) => `run-${index}`);
const contrastOnChart = (color: string, theme: ChartTheme) =>
  contrastRatio(parseHexColor(color), parseHexColor(CHART_BACKGROUND_COLORS[theme]));

function hueOf(hex: string): number {
  const { red, green, blue } = parseHexColor(hex);
  const max = Math.max(red, green, blue);
  const chroma = max - Math.min(red, green, blue);
  const sector =
    max === red ? ((green - blue) / chroma + 6) % 6 : max === green ? (blue - red) / chroma + 2 : (red - green) / chroma + 4;
  return sector * 60;
}
const hueGap = (left: number, right: number) => {
  const gap = Math.abs(left - right) % 360;
  return Math.min(gap, 360 - gap);
};

describe('図の線の色と模様', () => {
  it('2本と3本の線は色も模様もすべて違い、並べ替えても同じRunは同じになる', () => {
    for (const count of [2, 3]) {
      const styles = distinctSeriesStyles(runIds(count), 'light');
      const shown = [...styles.values()];
      expect(new Set(shown.map((style) => style.color)).size).toBe(count);
      expect(new Set(shown.map((style) => style.dashPattern)).size).toBe(count);
      expect(distinctSeriesStyles([...runIds(count)].reverse(), 'light')).toEqual(styles);
    }
  });

  it('1本目は実線で、4本までは線の模様だけでも見分けられる', () => {
    const styles = [...distinctSeriesStyles(runIds(4), 'dark').values()];
    expect(styles[0]!.dashPattern).toBeNull();
    expect(new Set(styles.map((style) => style.dashPattern)).size).toBe(4);
  });

  it('9本以上でも24本までは線ごとに色相が重ならず、並べ替えても同じ色になる', () => {
    // 15度ずつ離れた24の色相。#rrggbbへの丸めで色相が動くのは1度未満。
    const ids = runIds(12);
    const styles = distinctSeriesStyles(ids, 'light');
    const hues = [...styles.values()].map((style) => hueOf(style.color));
    for (const [index, hue] of hues.entries())
      for (const other of hues.slice(index + 1)) expect(hueGap(hue, other)).toBeGreaterThanOrEqual(14);
    expect(distinctSeriesStyles([...ids].reverse(), 'light')).toEqual(styles);
  });

  it('どの本数でも、ライトとダークの背景に対して線は3:1以上ある', () => {
    for (const theme of THEMES)
      for (const count of [1, 2, 3, 8, 9, 200]) {
        const contrasts = [...distinctSeriesStyles(runIds(count), theme).values()].map((style) =>
          contrastOnChart(style.color, theme),
        );
        expect(Math.min(...contrasts)).toBeGreaterThanOrEqual(3);
      }
  });

  it('同じ背景の色を tokens.css の --background と共有する', () => {
    const tokensPath = createRequire(import.meta.url).resolve('@mado/design-system/tokens.css');
    const tokens = readFileSync(tokensPath, 'utf8');
    const backgroundOf = (selector: string) => {
      const block = tokens.slice(tokens.indexOf(`${selector} {`));
      return /--background:\s*(#[0-9a-f]+);/i.exec(block)![1]!.toLowerCase();
    };
    const expand = (hex: string) => (hex.length === 4 ? `#${[...hex.slice(1)].map((digit) => digit + digit).join('')}` : hex);
    expect(expand(backgroundOf(':root'))).toBe(CHART_BACKGROUND_COLORS.light);
    expect(expand(backgroundOf(":root[data-theme='dark']"))).toBe(CHART_BACKGROUND_COLORS.dark);
  });
});
