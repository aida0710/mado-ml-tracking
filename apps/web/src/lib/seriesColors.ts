import { hslToRgb, parseHexColor, relativeLuminance, toHexColor } from './colorContrast';

export type ChartTheme = 'light' | 'dark';

/**
 * 線を描く背景（.metrics-chart-canvasは@mado/design-systemの--backgroundを使う）。
 * seriesColors.test.tsが、これらをtokens.cssと照らし合わせて確かめる。
 */
export const CHART_BACKGROUND_COLORS: Record<ChartTheme, string> = {
  light: '#ffffff',
  dark: '#191b1e',
};

// 線が8本まではこの順に色を取る（datavizの参照パレット: 青、オレンジ、アクア、黄、マゼンタ、緑、
// 紫、赤）。この順は1型・2型の色覚でも隣どうしを見分けやすくし、最初の3色どうしも離すので、
// Runが2つか3つなら色覚に頼らずに見分けられる。白の上では、アクア、黄、マゼンタは暗い段（暗い
// テーマのもの）を使い、WCAGがグラフィックに求める3:1を保つ。
const CATEGORICAL_COLORS: Record<ChartTheme, readonly string[]> = {
  light: ['#2a78d6', '#eb6834', '#199e70', '#c98500', '#d55181', '#008300', '#4a3aa7', '#e34948'],
  dark: ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#008300', '#9085e9', '#e66767'],
};

// 同じ順の線のSVGのstroke-dasharray: 実線、破線、点線、一点鎖線。色とは別の手がかりにし、
// 印刷でもどの色覚でも線を見分けられるようにする。5〜8本目は、別の色でこれらを繰り返す。
const SERIES_DASH_PATTERNS: readonly (string | null)[] = [null, '7 4', '2 3', '9 3 2 3'];

// パレットより多い線（Runが最大200あるRunの一覧など）: 15度ずつ離れた24の色相を、2段階の
// コントラストで使う。idをハッシュで割り当て、1つの図の中では近い色相を離す（下を参照）。
const SERIES_HUE_COUNT = 24;
const SERIES_HUE_STEP_DEGREES = 15;
const SERIES_SATURATION = 0.62;
// 色相の円を、アプリのティールから始める。
const SERIES_HUE_OFFSET_DEGREES = 177;
// 各段は背景に対するコントラストなので、黄の線も青の線と同じくらい読める（全色相に1つのHSLの
// 明度を使うと、白の上で黄が薄くなった）。どちらの段も3:1を上回る。
const SERIES_CONTRAST_LEVELS: Record<ChartTheme, readonly number[]> = {
  light: [4.5, 3.2],
  dark: [6.5, 4],
};
// 明度の範囲をこの回数だけ半分にすれば、1チャンネルの1/255より十分小さい誤差に収まる。
const LIGHTNESS_SEARCH_STEPS = 20;

// 色相がこの段数（45度）より近い細い線は、マゼンタの隣の紫のように1色に見える。図は、隣の線と
// 少なくともこれだけ離れるまで線の色相を動かす。
const DISTINCT_HUE_STEPS = 3;

/**
 * 複数のキーを持つパネルで、`index`番目のメトリクスのキーの線の模様。そこでは色でRunを見分ける。
 * 模様はキー4つごとに繰り返す。
 */
export function metricKeyDashPattern(index: number): string | null {
  return SERIES_DASH_PATTERNS[index % SERIES_DASH_PATTERNS.length]!;
}

/** 図の1本の線の描き方。 */
export interface SeriesStyle {
  color: string;
  /** stroke-dasharray。実線ならnull。 */
  dashPattern: string | null;
}

/**
 * 与えたid（ページのすべてのRun、または1つの図の線）に対するスタイル。描く順ではなく並べ替えた
 * idの順に従うので、Runを並べ替えてもRunのスタイルは変わらない。idが8つまでならパレットを順に
 * 取り、それぞれに線の模様を付ける。それより多ければ、各idから色相を決める（hueWheelColors）。
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
 * 系列自身の色はidだけ（Runのid、またはグループのid）で決まるので、多くのRunの図をまたいでも
 * Runは同じ色を保つ。前の系列（結果が描く順に左右されないよう、idの順）が近すぎる色相を取って
 * いなければその色のままで、取っていればそのすべてから十分離れたいちばん近い色相へ動く。系列が
 * 多いときは必要な距離を段階的に縮めるので、どの系列にも色が付く。
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
        // 望ましい色相を試し、次に両側へ1段、2段と順に試す。
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

/** 背景に対するコントラストがその段の値になる、色相の段の色。 */
function hueWheelColor({ hueStep, levelIndex }: ColorSlot, theme: ChartTheme): string {
  const cacheKey = `${theme}:${hueStep}:${levelIndex}`;
  const cached = hueWheelColorCache.get(cacheKey);
  if (cached) return cached;
  const hue = (SERIES_HUE_OFFSET_DEGREES + hueStep * SERIES_HUE_STEP_DEGREES) % 360;
  const backgroundLuminance = relativeLuminance(parseHexColor(CHART_BACKGROUND_COLORS[theme]));
  const targetContrast = SERIES_CONTRAST_LEVELS[theme][levelIndex]!;
  // 暗い背景より明るく、明るい背景より暗くする。
  const targetLuminance =
    theme === 'dark'
      ? targetContrast * (backgroundLuminance + 0.05) - 0.05
      : (backgroundLuminance + 0.05) / targetContrast - 0.05;
  // 色相と彩度を固定すると輝度はHSLの明度とともに増えるので、二分法で求められる。
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

/** 32ビットのFNV-1a。速く、似たid（uuidの先頭、連番の名前）もばらけさせる。 */
function hashId(id: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < id.length; index += 1) {
    hash ^= id.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}
