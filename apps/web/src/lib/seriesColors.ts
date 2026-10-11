import { hslToRgb, parseHexColor, relativeLuminance, toHexColor } from './colorContrast';

export type ChartTheme = 'light' | 'dark';

/**
 * The background the lines are drawn on (.metrics-chart-canvas uses --background of
 * @mado/design-system). seriesColors.test.ts checks these against tokens.css.
 */
export const CHART_BACKGROUND_COLORS: Record<ChartTheme, string> = {
  light: '#ffffff',
  dark: '#191b1e',
};

// Up to eight lines take these in this order (the dataviz reference palette: blue, orange, aqua,
// yellow, magenta, green, violet, red). The order keeps neighbors apart for protanopia and
// deuteranopia, and the first three apart from each other, so two or three Runs never need color
// vision to be told apart. On white, aqua, yellow and magenta use their darker steps (the ones of
// the dark theme) to keep the 3:1 WCAG asks of graphics.
const CATEGORICAL_COLORS: Record<ChartTheme, readonly string[]> = {
  light: ['#2a78d6', '#eb6834', '#199e70', '#c98500', '#d55181', '#008300', '#4a3aa7', '#e34948'],
  dark: ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#008300', '#9085e9', '#e66767'],
};

// SVG stroke-dasharray of the lines in the same order: solid, dashed, dotted, dash-dot. A second
// channel besides color, so lines are told apart in print and with any color vision. Slots 5 to 8
// repeat them with other colors.
const SERIES_DASH_PATTERNS: readonly (string | null)[] = [null, '7 4', '2 3', '9 3 2 3'];

// More lines than the palette holds (a Run list of up to 200 Runs): 24 hues 15 degrees apart at two
// contrast levels. Ids hash onto them; within one chart close hues are moved apart (below).
const SERIES_HUE_COUNT = 24;
const SERIES_HUE_STEP_DEGREES = 15;
const SERIES_SATURATION = 0.62;
// Starts the hue circle at the application teal.
const SERIES_HUE_OFFSET_DEGREES = 177;
// Each level is a contrast against the background, so a yellow line reads as well as a blue one
// (one HSL lightness for all hues made yellow pale on white). Both stay above 3:1.
const SERIES_CONTRAST_LEVELS: Record<ChartTheme, readonly number[]> = {
  light: [4.5, 3.2],
  dark: [6.5, 4],
};
// Halving the lightness range this many times lands well within 1/255 of a channel.
const LIGHTNESS_SEARCH_STEPS = 20;

// Thin lines whose hues are closer than this many steps (45 degrees) read as one color, such as
// purple next to magenta. A chart moves a line's hue until its neighbors are at least this far.
const DISTINCT_HUE_STEPS = 3;

/**
 * The line pattern of the `index`-th metric key of a panel with several keys, where color tells
 * the Runs apart; the patterns repeat after four keys.
 */
export function metricKeyDashPattern(index: number): string | null {
  return SERIES_DASH_PATTERNS[index % SERIES_DASH_PATTERNS.length]!;
}

/** How one line of a chart is drawn. */
export interface SeriesStyle {
  color: string;
  /** stroke-dasharray, or null for a solid line. */
  dashPattern: string | null;
}

/**
 * Styles for the given ids (every Run of a page, or the lines of one chart). They follow the ids
 * sorted, not the order drawn, so a Run keeps its style when the Runs are reordered. Up to eight ids
 * take the palette in order, each with a line pattern; more ids take a hue from their own id
 * (hueWheelColors).
 */
export function distinctSeriesStyles(
  ids: readonly string[],
  theme: ChartTheme,
): Map<string, SeriesStyle> {
  const sortedIds = [...new Set(ids)].sort();
  const palette = CATEGORICAL_COLORS[theme];
  if (sortedIds.length > palette.length)
    return new Map(
      [...hueWheelColors(sortedIds, theme)].map(([id, color]) => [id, { color, dashPattern: null }]),
    );
  return new Map(
    sortedIds.map((id, index) => [
      id,
      {
        color: palette[index]!,
        dashPattern: SERIES_DASH_PATTERNS[index % SERIES_DASH_PATTERNS.length]!,
      },
    ]),
  );
}

interface ColorSlot {
  hueStep: number;
  levelIndex: number;
}

function preferredSlot(id: string, levelCount: number): ColorSlot {
  const slot = hashId(id) % (SERIES_HUE_COUNT * levelCount);
  return { hueStep: slot % SERIES_HUE_COUNT, levelIndex: Math.floor(slot / SERIES_HUE_COUNT) };
}

const hueDistance = (left: number, right: number) => {
  const distance = Math.abs(left - right) % SERIES_HUE_COUNT;
  return Math.min(distance, SERIES_HUE_COUNT - distance);
};

/**
 * A series' own color comes from its id alone (a Run id, or a group id), so a Run keeps it across
 * charts of many Runs. It keeps that color unless a series before it (by id, so the result does not
 * depend on the order drawn) took a hue too close; then it moves to the nearest hue far enough from
 * all of them. With many series the required distance shrinks step by step, so every series still
 * gets a color.
 */
function hueWheelColors(sortedIds: readonly string[], theme: ChartTheme): Map<string, string> {
  const levelCount = SERIES_CONTRAST_LEVELS[theme].length;
  const taken: number[] = [];
  const colors = new Map<string, string>();
  for (const id of sortedIds) {
    const preferred = preferredSlot(id, levelCount);
    let hueStep = preferred.hueStep;
    search: for (let required = DISTINCT_HUE_STEPS; required > 0; required -= 1) {
      for (let offset = 0; offset < SERIES_HUE_COUNT; offset += 1) {
        // Tries the preferred hue, then one step either side, two steps, and so on.
        const shift = offset % 2 === 0 ? offset / 2 : -(offset + 1) / 2;
        const candidate = (preferred.hueStep + shift + SERIES_HUE_COUNT) % SERIES_HUE_COUNT;
        if (taken.every((step) => hueDistance(step, candidate) >= required)) {
          hueStep = candidate;
          break search;
        }
      }
    }
    taken.push(hueStep);
    colors.set(id, hueWheelColor({ hueStep, levelIndex: preferred.levelIndex }, theme));
  }
  return colors;
}

const hueWheelColorCache = new Map<string, string>();

/** The color of a hue step whose contrast against the background is the level's. */
function hueWheelColor({ hueStep, levelIndex }: ColorSlot, theme: ChartTheme): string {
  const cacheKey = `${theme}:${hueStep}:${levelIndex}`;
  const cached = hueWheelColorCache.get(cacheKey);
  if (cached) return cached;
  const hue = (SERIES_HUE_OFFSET_DEGREES + hueStep * SERIES_HUE_STEP_DEGREES) % 360;
  const backgroundLuminance = relativeLuminance(parseHexColor(CHART_BACKGROUND_COLORS[theme]));
  const targetContrast = SERIES_CONTRAST_LEVELS[theme][levelIndex]!;
  // Lighter than the dark background, darker than the light one.
  const targetLuminance =
    theme === 'dark'
      ? targetContrast * (backgroundLuminance + 0.05) - 0.05
      : (backgroundLuminance + 0.05) / targetContrast - 0.05;
  // Luminance grows with HSL lightness at a fixed hue and saturation, so a bisection finds it.
  let [low, high] = [0, 1];
  for (let step = 0; step < LIGHTNESS_SEARCH_STEPS; step += 1) {
    const lightness = (low + high) / 2;
    const luminance = relativeLuminance(hslToRgb({ hue, saturation: SERIES_SATURATION, lightness }));
    if (luminance < targetLuminance) low = lightness;
    else high = lightness;
  }
  const color = toHexColor(
    hslToRgb({ hue, saturation: SERIES_SATURATION, lightness: (low + high) / 2 }),
  );
  hueWheelColorCache.set(cacheKey, color);
  return color;
}

/** 32-bit FNV-1a: fast, and spreads similar ids (uuid prefixes, sequential names) apart. */
function hashId(id: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < id.length; index += 1) {
    hash ^= id.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}
