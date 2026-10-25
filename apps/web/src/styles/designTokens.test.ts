import { readdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import { BREAKPOINT_PX } from '@mado/design-system/layout';
import { contrastRatio, parseHexColor } from '../lib/colorContrast';

const stylesDirectory = new URL('./', import.meta.url);
const stylesheetNames = readdirSync(stylesDirectory).filter((name) => name.endsWith('.css'));
const withoutComments = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '');
const readStylesheet = (name: string) => withoutComments(readFileSync(new URL(name, stylesDirectory), 'utf8'));
const resolvePackageFile = createRequire(import.meta.url).resolve;
const readPackageFile = (name: string) =>
  withoutComments(readFileSync(resolvePackageFile(`@mado/design-system/${name}`), 'utf8'));
const tokensCss = readPackageFile('tokens.css');
// The shared element defaults, components, app frame and code view, which use the tokens like this
// app does.
const sharedStylesheets = ['base.css', 'components.css', 'shell.css', 'code.css', 'lineage.css'].map((name) => ({
  name: `@mado/design-system/${name}`,
  css: readPackageFile(name),
}));
const appStylesheets = stylesheetNames.map((name) => ({ name, css: readStylesheet(name) }));
const allStylesheets = [...sharedStylesheets, ...appStylesheets];
// このアプリだけが使う色の変数を値で書く場所（デザインシステムの決まりの「アプリの変数の定義」）。
const APP_TOKENS_STYLESHEET = 'base.css';
const appTokensCss = readStylesheet(APP_TOKENS_STYLESHEET);
const LIGHT_SELECTOR = ':root';
const DARK_SELECTOR = ":root[data-theme='dark']";

// Custom properties a component sets inline: ChartPanelGrid the chart row height, the app shells
// the sidebar width the user dragged, Tabs the width of the fade at an end that hides tabs.
const PROPERTIES_SET_FROM_COMPONENTS = ['--chart-row-height', '--navigation-width', '--tab-edge-fade'];
const LITERAL_COLOR =
  /#[0-9a-f]{3,8}\b|\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch)\(|(?<![\w-])(?:white|black)(?![\w-])/i;

const declarations = (css: string) =>
  [...css.matchAll(/((?:--)?[a-z][\w-]*)\s*:\s*([^;{}]+);/gi)].map((match) => ({
    property: match[1]!,
    value: match[2]!.trim(),
  }));
const definedProperties = (css: string) =>
  declarations(css)
    .map(({ property }) => property)
    .filter((property) => property.startsWith('--'));
const ruleBody = (css: string, selector: string) => {
  const start = css.indexOf(`${selector} {`);
  return start < 0 ? '' : css.slice(start, css.indexOf('}', start));
};
const customPropertyValues = (css: string) =>
  Object.fromEntries(
    declarations(css)
      .filter(({ property }) => property.startsWith('--'))
      .map(({ property, value }) => [property, value]),
  );
// テーマごとの変数の値。ダークはライトの値をダークの定義で上書きしたもの。
const themeValues = (css: string) => {
  const light = customPropertyValues(ruleBody(css, LIGHT_SELECTOR));
  return { light, dark: { ...light, ...customPropertyValues(ruleBody(css, DARK_SELECTOR)) } };
};

describe('design tokens', () => {
  it('色を値で書くのはこのアプリの変数の定義だけで、ほかは変数を使う', () => {
    const appTokenDefinitions = new Set(
      [LIGHT_SELECTOR, DARK_SELECTOR].flatMap((selector) =>
        declarations(ruleBody(appTokensCss, selector))
          .filter(({ property }) => property.startsWith('--'))
          .map(({ property, value }) => `${APP_TOKENS_STYLESHEET}: ${property}: ${value}`),
      ),
    );
    const offending = allStylesheets.flatMap(({ name, css }) =>
      declarations(css)
        .filter(({ value }) => LITERAL_COLOR.test(value))
        .map(({ property, value }) => `${name}: ${property}: ${value}`)
        .filter((declaration) => !appTokenDefinitions.has(declaration)),
    );
    expect(offending).toEqual([]);
  });

  it('スタイルシートが参照する変数はどれも定義されている', () => {
    const defined = new Set([
      ...definedProperties(tokensCss),
      ...allStylesheets.flatMap(({ css }) => definedProperties(css)),
      ...PROPERTIES_SET_FROM_COMPONENTS,
    ]);
    const undefinedReferences = allStylesheets.flatMap(({ name, css }) =>
      [...css.matchAll(/var\((--[\w-]+)/g)]
        .map((match) => match[1]!)
        .filter((property) => !defined.has(property))
        .map((property) => `${name}: ${property}`),
    );
    expect(undefinedReferences).toEqual([]);
  });

  it('どのスタイルシートのメディアクエリもデザインシステムの切り替え幅だけを使う', () => {
    const allowed = new Set(Object.values(BREAKPOINT_PX).map((px) => `(width < ${px}px)`));
    // 切り替え幅より広いタッチ画面は `(width < …), (pointer: coarse)` で同じ指定に加えてよい。
    const isAllowedCondition = (condition: string) =>
      condition.startsWith('(prefers-') || condition === '(pointer: coarse)' || allowed.has(condition);
    const offending = allStylesheets.flatMap(({ name, css }) =>
      [...css.matchAll(/@media\s+([^{]*?)\s*\{/g)]
        .map((match) => match[1]!)
        .filter((query) => !query.split(/\s*,\s*/).every(isAllowedCondition))
        .map((query) => `${name}: ${query}`),
    );
    expect(offending).toEqual([]);
  });

  it('ダークテーマはライトにある変数だけを上書きする', () => {
    for (const css of [tokensCss, appTokensCss]) {
      const light = new Set(definedProperties(ruleBody(css, LIGHT_SELECTOR)));
      const dark = definedProperties(ruleBody(css, DARK_SELECTOR));
      expect(dark.length).toBeGreaterThan(0);
      expect(dark.filter((property) => !light.has(property))).toEqual([]);
    }
  });
});

// デザインシステムから移したこのアプリの色の、文字のコントラスト（WCAG AA の 4.5:1）。
describe('このアプリの色のコントラスト', () => {
  const designSystemThemes = themeValues(tokensCss);
  const appThemes = themeValues(appTokensCss);
  const pairs = [
    // 運用の通知の数は、暗いままの上部バーと、そのボタンにマウスを載せた色の上に出る。
    ...['--header', '--header-hover', '--header-active'].map((surface) => ['--header-alert', surface]),
    ['--status-stopped-text', '--status-stopped-background'],
  ];
  for (const theme of ['light', 'dark'] as const) {
    it(`${theme}: 文字は地に対して 4.5:1 以上`, () => {
      const values: Record<string, string | undefined> = { ...designSystemThemes[theme], ...appThemes[theme] };
      const failing = pairs
        .map(([foreground, background]) => ({
          pair: `${foreground} on ${background}`,
          ratio: contrastRatio(parseHexColor(values[foreground!]!), parseHexColor(values[background!]!)),
        }))
        .filter(({ ratio }) => ratio < 4.5)
        .map(({ pair, ratio }) => `${pair}: ${ratio.toFixed(2)}`);
      expect(failing).toEqual([]);
    });
  }
});
