// キーボードとスクリーンリーダーでの使い方のブラウザでの確認。メトリクスの図はフォーカスの止まる所が
// 1つで、矢印キーで値を出し、+で拡大する。比べるRunは色だけでなく線の種類でも見分けられ、どちらの
// テーマでも3:1を保ち、軸の文字は4.5:1。どの画面もブラウザのタブに名前を付ける。ユーザーメニュー、
// ポップオーバー、ダイアログは、キーボードで期待される位置にフォーカスを置く。MMT_AXE_CORE_PATH
// （axe.min.js）を渡すと、axeが主な画面でWCAG 2.1 A/AAの違反を見つけない。
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { createBrowserApi } from './browserApi.mjs';

const modulePath = process.env.MMT_PLAYWRIGHT_MODULE;
if (!modulePath) throw new Error('Set MMT_PLAYWRIGHT_MODULE to an installed Playwright index.mjs');
const { chromium } = await import(pathToFileURL(modulePath).href);
const browser = await chromium.launch({
  headless: true,
  ...(process.env.MMT_CHROMIUM_PATH ? { executablePath: process.env.MMT_CHROMIUM_PATH } : {}),
  args: ['--no-sandbox'],
});
const base = process.env.MMT_WEB_URL ?? 'http://127.0.0.1:5182';
const axeCorePath = process.env.MMT_AXE_CORE_PATH;
const DESKTOP = { width: 1440, height: 900 };
const PHONE = { width: 390, height: 844 };
// WCAG 2.1では、文字は4.5:1、線などの図形は3:1。
const MIN_TEXT_CONTRAST = 4.5;
const MIN_GRAPHIC_CONTRAST = 3;
const POINTS_PER_SERIES = 40;
const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];
// アバターは利用者のイニシャルを表示し、名前は「ユーザーメニュー」。イニシャルを見えるラベルと
// みなすか（WCAG 2.5.3）は決めずにおく。ほかの確認がこの名前どおりにボタンを探すため。
const AXE_RULES_LEFT_OPEN = { 'label-content-name-mismatch': { enabled: false } };

const api = createBrowserApi();
api.state.loggedIn = true;
// 未解決のアラートを1件置き、ベルのポップオーバーにTabで移れるリンクを作る。
const openAlert = {
  id: '00000000-0000-4000-8000-000000008999',
  projectId: api.state.project.id,
  kind: 'worker.offline',
  subjectId: 'token:preview-voice-cpu',
  openedAt: '2026-10-11T05:00:00Z',
  resolvedAt: null,
  resolution: null,
  detail: { workerId: 'preview-voice-cpu', hostname: 'gpu-node-01.example.invalid' },
};
const [firstRun, secondRun] = api.state.runs;
const projectBase = `${base}/projects/${api.state.project.id}`;

// idで先頭のRunはこのkeyの値を記録していないので、この図にはもう一方のRunだけが描かれる。その
// Runも、ほかの図と同じ色と線の種類を保たなければならない。
const KEY_WITHOUT_FIRST_RUN = 'val/cer';

// Runごとに下がっていく曲線。線が重ならないよう、Runごとにずらす。
function seriesOf(runId, key, index) {
  const points = Array.from({ length: POINTS_PER_SERIES }, (_, step) => {
    const value = Math.exp(-step / 10) + index * 0.1;
    return { x: step, step, value, min: value, max: value, count: 1 };
  });
  return { runId, key, points, sampled: false, totalPoints: points.length, nanCount: 0, droppedPoints: 0 };
}

async function openPage({ viewport = DESKTOP, theme = 'light', isMobile = false } = {}) {
  const context = await browser.newContext({ locale: 'ja-JP', viewport, isMobile, hasTouch: isMobile });
  await context.addInitScript((value) => localStorage.setItem('mmt.theme', value), theme);
  await context.route(
    (url) => url.pathname.startsWith('/api/'),
    async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      const reply = (payload) =>
        route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(payload) });
      if (url.pathname.endsWith('/metrics/series') && request.method() === 'POST') {
        const body = request.postDataJSON();
        const [firstRunId] = [...body.runIds].sort();
        const isLogged = (runId, key) =>
          !(key === KEY_WITHOUT_FIRST_RUN && body.runIds.length > 1 && runId === firstRunId);
        return reply({
          series: body.runIds.flatMap((runId, index) =>
            body.keys.filter((key) => isLogged(runId, key)).map((key) => seriesOf(runId, key, index)),
          ),
        });
      }
      if (/\/runs\/[^/]+\/resume-events$/.test(url.pathname)) return reply({ items: [], segments: [] });
      if (url.pathname.endsWith('/operations-alerts') && request.method() === 'GET') return reply({ items: [openAlert] });
      if (url.pathname.endsWith('/saved-views') && request.method() === 'GET') return reply({ items: [] });
      return api.route(route);
    },
  );
  const page = await context.newPage();
  page.on('pageerror', (error) => pageErrors.push(error.message));
  return { context, page };
}
const pageErrors = [];
const activeElementText = (page) =>
  page.evaluate(() => {
    const element = document.activeElement;
    return element?.getAttribute('aria-label') ?? element?.textContent?.trim() ?? element?.tagName;
  });

// ブラウザが実際に描いた、図の背景に対する軸の文字と線のコントラスト。
function chartContrasts(page) {
  return page.evaluate(() => {
    const parse = (value) => value.match(/\d+(\.\d+)?/g).slice(0, 3).map(Number);
    const luminance = (color) =>
      parse(color)
        .map((channel) => channel / 255)
        .map((channel) => (channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4))
        .reduce((sum, channel, index) => sum + channel * [0.2126, 0.7152, 0.0722][index], 0);
    const contrast = (left, right) => {
      const [lighter, darker] = [luminance(left), luminance(right)].sort((first, second) => second - first);
      return (lighter + 0.05) / (darker + 0.05);
    };
    const panel = document.querySelector('.chart-panel');
    const background = getComputedStyle(panel.querySelector('.metrics-chart-canvas')).backgroundColor;
    const ticks = [...panel.querySelectorAll('.recharts-cartesian-axis-tick-value')];
    const lines = [...panel.querySelectorAll('.chart-line')].map((line) => getComputedStyle(line));
    return {
      minTick: Math.min(...ticks.map((tick) => contrast(getComputedStyle(tick).fill, background))),
      minLine: Math.min(...lines.map((line) => contrast(line.stroke, background))),
      strokes: lines.map((line) => line.stroke),
      dashes: lines.map((line) => line.strokeDasharray),
    };
  });
}

async function axeViolations(page) {
  await page.addScriptTag({ path: axeCorePath });
  return page.evaluate(
    async ({ tags, rules }) => {
      const result = await window.axe.run(document, {
        runOnly: { type: 'tag', values: tags },
        rules,
        resultTypes: ['violations'],
      });
      return result.violations.map(
        (violation) => `${violation.id}: ${violation.nodes.map((node) => node.target.join(' ')).join(', ')}`,
      );
    },
    { tags: AXE_TAGS, rules: AXE_RULES_LEFT_OPEN },
  );
}

try {
  console.log('Browser check: compared Runs differ in color and line pattern, readable on both themes');
  for (const theme of ['light', 'dark']) {
    const { context, page } = await openPage({ theme });
    await page.goto(`${projectBase}/compare?runs=${firstRun.id},${secondRun.id}`);
    await page.locator('.chart-panel .chart-line').nth(1).waitFor();
    const contrasts = await chartContrasts(page);
    assert.ok(contrasts.minTick >= MIN_TEXT_CONTRAST, `${theme}: axis text ${contrasts.minTick}`);
    assert.ok(contrasts.minLine >= MIN_GRAPHIC_CONTRAST, `${theme}: lines ${contrasts.minLine}`);
    assert.equal(new Set(contrasts.strokes).size, 2, `${theme}: two colors`);
    assert.equal(new Set(contrasts.dashes).size, 2, `${theme}: two line patterns`);
    // 凡例は各線の種類を名前の横に出す。
    const legendDashes = await page
      .locator('.chart-panel')
      .first()
      .locator('.chart-legend-swatch line')
      .evaluateAll((swatches) => swatches.map((swatch) => swatch.getAttribute('stroke-dasharray')));
    assert.deepEqual(new Set(legendDashes).size, 2);
    await context.close();
  }

  console.log('Browser check: a Run has the same color and line pattern in every chart of the page');
  {
    const { context, page } = await openPage();
    await page.goto(`${projectBase}/compare?runs=${firstRun.id},${secondRun.id}`);
    const panels = page.locator('.chart-panel');
    const panelOf = (title) => panels.filter({ has: page.getByRole('heading', { name: title, exact: true }) });
    await panelOf('accuracy').locator('.chart-legend-item').nth(1).waitFor();
    await panelOf(KEY_WITHOUT_FIRST_RUN).locator('.chart-legend-item').first().waitFor();
    const legendStyles = (panel) =>
      panel.locator('.chart-legend-item').evaluateAll((items) =>
        Object.fromEntries(
          items.map((item) => {
            const swatch = item.querySelector('.chart-legend-swatch line');
            return [
              item.querySelector('.chart-legend-label').textContent,
              `${swatch.getAttribute('stroke')} ${swatch.getAttribute('stroke-dasharray')}`,
            ];
          }),
        ),
      );
    const bothRuns = await legendStyles(panelOf('accuracy'));
    const oneRun = await legendStyles(panelOf(KEY_WITHOUT_FIRST_RUN));
    assert.equal(Object.keys(oneRun).length, 1);
    for (const [label, style] of Object.entries(oneRun))
      assert.equal(style, bothRuns[label], `${label} keeps its style where the other Run logged nothing`);
    await context.close();
  }

  console.log('Browser check: the chart is one focus stop with values on the arrow keys and zoom on +');
  {
    const { context, page } = await openPage();
    await page.goto(`${projectBase}/runs/${firstRun.id}`);
    const canvas = page.locator('.metrics-chart-canvas').first();
    await canvas.locator('.chart-line').first().waitFor();
    assert.equal(await canvas.getAttribute('role'), 'application');
    assert.equal(await canvas.getAttribute('tabindex'), '0');
    const innerStops = await canvas.evaluate(
      (element) => [...element.querySelectorAll('[tabindex]')].filter((inner) => inner.tabIndex >= 0).length,
    );
    assert.equal(innerStops, 0, 'no focus stop inside the chart');
    const description = await canvas.evaluate((element) =>
      element
        .getAttribute('aria-describedby')
        .split(' ')
        .map((id) => document.getElementById(id).textContent)
        .join(' '),
    );
    assert.match(description, /最新 .+（.+）、最小 .+、最大/);
    await canvas.focus();
    await page.keyboard.press('ArrowRight');
    await page.locator('.chart-tooltip').first().waitFor();
    assert.match(await page.locator('.chart-tooltip').first().textContent(), /training-test-01/);
    await page.keyboard.press('End');
    await page.keyboard.press('+');
    await page.getByRole('button', { name: 'ズームを戻す' }).first().waitFor();
    assert.equal(await page.locator('.chart-tooltip').count(), 1, 'the values stay while zooming around them');
    await page.keyboard.press('-');
    await page.getByRole('button', { name: 'ズームを戻す' }).first().waitFor({ state: 'detached' });
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('.chart-tooltip').count(), 0, 'Escape hides the values');
    // Ctrl、Cmd、Altと一緒に押したキーはブラウザのもの（ページの拡大、戻る、進む）。
    const isTakenByChart = (key, modifiers) =>
      canvas.evaluate(
        (element, init) => {
          const event = new KeyboardEvent('keydown', { ...init, bubbles: true, cancelable: true });
          element.dispatchEvent(event);
          return event.defaultPrevented;
        },
        { key, ...modifiers },
      );
    assert.equal(await isTakenByChart('+', { ctrlKey: true }), false, 'Ctrl + zooms the page');
    assert.equal(await isTakenByChart('-', { metaKey: true }), false, 'Cmd - zooms the page out');
    assert.equal(await isTakenByChart('ArrowLeft', { altKey: true }), false, 'Alt ← goes back');
    assert.equal(await page.getByRole('button', { name: 'ズームを戻す' }).count(), 0, 'the chart did not zoom');
    assert.equal(await page.locator('.chart-tooltip').count(), 0, 'nor show values');
    assert.equal(await isTakenByChart('+', { shiftKey: true }), true, 'Shift is how + is typed');
    await context.close();
  }

  console.log('Browser check: every screen names the browser tab after its heading');
  {
    const { context, page } = await openPage();
    for (const [path, expected] of [
      [`${projectBase}/experiments`, /^Runs · .*UI検証用プロジェクト · mado ML Tracking$/],
      [`${projectBase}/runs/${firstRun.id}`, /^training-test-01 · .* · mado ML Tracking$/],
      [`${projectBase}/models`, /^Models · UI検証用プロジェクト · mado ML Tracking$/],
      [`${base}/settings/account`, /^アカウント · 全体設定 · mado ML Tracking$/],
    ]) {
      await page.goto(path);
      await page.waitForFunction((pattern) => new RegExp(pattern).test(document.title), expected.source);
    }
    await context.close();
  }

  console.log('Browser check: the user menu, popovers and dialogs keep the keyboard focus in place');
  {
    const { context, page } = await openPage();
    await page.goto(`${projectBase}/experiments`);
    await page.waitForLoadState('networkidle');
    const avatar = page.getByRole('button', { name: 'ユーザーメニュー', exact: true });
    await avatar.focus();
    await page.keyboard.press('Enter');
    assert.equal(await activeElementText(page), 'アカウント', 'Enter opens on the first item');
    await page.keyboard.press('ArrowDown');
    assert.equal(await activeElementText(page), 'パスワードの変更');
    await page.keyboard.press('Escape');
    assert.equal(await activeElementText(page), 'ユーザーメニュー', 'Escape goes back to the avatar');
    assert.equal(await page.getByRole('menu').count(), 0);
    // クリックで開いたときはフォーカスがアバターに残り、そこから↓と↑でメニューに入る。
    await avatar.click();
    await page.getByRole('menu').waitFor();
    await page.keyboard.press('ArrowDown');
    assert.equal(await activeElementText(page), 'アカウント', '↓ after a click goes to the first item');
    await avatar.focus();
    await page.keyboard.press('ArrowUp');
    const lastItem = await page.getByRole('menuitem').last().textContent();
    assert.equal(await activeElementText(page), lastItem.trim(), '↑ after a click goes to the last item');
    await page.keyboard.press('Escape');

    const bell = page.locator('.operations-alert-button');
    await bell.focus();
    await page.keyboard.press('Enter');
    await page.locator('.operations-alert-popover a').waitFor();
    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => document.activeElement.closest('.operations-alert-popover') !== null), true);
    await page.keyboard.press('Escape');
    assert.equal(await page.evaluate(() => document.activeElement.classList.contains('operations-alert-button')), true, 'Escape goes back to the bell');

    const columns = page.locator('details.column-menu').first();
    await columns.locator('summary').focus();
    await page.keyboard.press('Enter');
    await page.keyboard.press('Escape');
    assert.equal(await columns.evaluate((element) => element.open), false, 'Escape closes 表示する列');
    assert.equal(await page.evaluate(() => document.activeElement.tagName), 'SUMMARY');
    await page.keyboard.press('Enter');
    await columns.locator('input').last().focus();
    await page.keyboard.press('Tab');
    assert.equal(await columns.evaluate((element) => element.open), false, 'Tab out closes 表示する列');

    const separators = await page
      .locator('.run-table [role="separator"]')
      .evaluateAll((elements) => elements.map((element) => element.getAttribute('aria-valuenow')));
    assert.ok(separators.length > 0 && separators.every((value) => Number(value) > 0), 'every border has its width');

    await page.getByRole('button', { name: 'Runを作成', exact: true }).click();
    await page.locator('dialog[open]').waitFor();
    // フォームのダイアログは、最初の欄にフォーカスを置いて開く。
    await page.waitForFunction(() => document.activeElement.labels?.[0]?.textContent === '名前 *');
    await page.keyboard.press('Escape');
    await context.close();
  }

  console.log('Browser check: on a phone a long dialog keeps its buttons in view and fills the screen');
  {
    const { context, page } = await openPage({ viewport: PHONE, isMobile: true });
    await page.goto(`${projectBase}/experiments`);
    await page.getByRole('button', { name: 'Runを作成', exact: true }).click();
    const dialog = page.locator('dialog[open]');
    await dialog.waitFor();
    // ダイアログ自身がフォーカスを取るので、開いたときにソフトウェアキーボードがダイアログを覆わない。
    await page.waitForFunction(() => document.activeElement.tagName === 'DIALOG');
    const footer = await dialog.locator('footer').first().evaluate((element) => element.getBoundingClientRect().bottom);
    assert.ok(footer <= PHONE.height, `保存 is in view (${footer})`);
    await page.keyboard.press('Escape');
    await page.goto(`${projectBase}/codes`);
    await page.getByRole('button', { name: 'バージョンを作成' }).first().click();
    const width = await page.locator('dialog[open]').evaluate((element) => element.getBoundingClientRect().width);
    assert.equal(Math.round(width), PHONE.width, 'the code version dialog fills the screen');
    await context.close();
  }

  if (axeCorePath) {
    console.log('Browser check: axe finds no WCAG 2.1 A/AA violation');
    const { context, page } = await openPage();
    for (const path of [
      `${projectBase}/experiments`,
      `${projectBase}/runs/${firstRun.id}`,
      `${projectBase}/runs/${firstRun.id}?tab=logs`,
      `${projectBase}/compare?runs=${firstRun.id},${secondRun.id}`,
      `${projectBase}/models`,
      `${projectBase}/settings`,
    ]) {
      await page.goto(path);
      await page.waitForLoadState('networkidle');
      assert.deepEqual(await axeViolations(page), [], path);
    }
    await context.close();
  } else console.log('Browser check: axe skipped (set MMT_AXE_CORE_PATH to an axe.min.js)');

  assert.deepEqual(pageErrors, []);
  console.log('Accessibility browser checks passed.');
} finally {
  await browser.close();
}
