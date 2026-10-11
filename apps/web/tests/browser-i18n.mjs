import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { createBrowserApi } from './browserApi.mjs';

const modulePath = process.env.MMT_PLAYWRIGHT_MODULE;
if (!modulePath) throw new Error('Set MMT_PLAYWRIGHT_MODULE to an installed Playwright index.mjs');
const { chromium } = await import(pathToFileURL(modulePath).href);
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'],
  ...(process.env.MMT_CHROMIUM_PATH ? { executablePath: process.env.MMT_CHROMIUM_PATH } : {}) });
const base = process.env.MMT_WEB_URL ?? 'http://127.0.0.1:5782';
const screenshots = process.env.MMT_SCREENSHOT_DIR;
const context = await browser.newContext({ locale: 'en-US', viewport: { width: 1440, height: 960 } });
const api = createBrowserApi();
api.state.user.displayName = 'Sample user';
api.state.project.name = 'Speech research';
api.state.project.description = 'Browser fixture';
api.state.experiments[0].name = 'Training experiments';
await context.route(url => url.pathname.startsWith('/api/'), api.route);
const page = await context.newPage();
const pageErrors = [];
page.on('pageerror', error => pageErrors.push(error.message));
async function switchLanguage(target, name) {
  await target.getByRole('button', { name: /^(Language|表示言語):/ }).click();
  await target.getByRole('menuitemradio', { name, exact: true }).click();
}
async function screenshot(name) {
  if (!screenshots) return;
  await mkdir(screenshots, { recursive: true });
  await page.screenshot({ path: `${screenshots}/${name}.png`, fullPage: true });
}
try {
  await page.goto(base);
  await page.getByLabel('Email address', { exact: true }).fill('sample@example.invalid');
  await page.getByLabel('Display name', { exact: true }).fill('Draft name');
  await switchLanguage(page, '日本語');
  assert.equal(await page.getByLabel('表示名', { exact: true }).inputValue(), 'Draft name');
  await switchLanguage(page, 'English');
  await screenshot('tracking-login-en');
  await page.getByRole('button', { name: 'Sign in (development mode)' }).click();
  await page.getByRole('heading', { name: 'Runs', exact: true }).waitFor();
  await page.getByRole('link', { name: 'training-test-01', exact: true }).waitFor();
  assert.equal(await page.locator('html').getAttribute('lang'), 'en');
  await screenshot('tracking-en');

  await page.getByLabel('Search', { exact: true }).fill("params.batch_size = '32'");
  const calls = api.state.calls.length;
  await switchLanguage(page, '日本語');
  await page.getByLabel('検索', { exact: true }).waitFor();
  assert.equal(await page.getByLabel('検索', { exact: true }).inputValue(), "params.batch_size = '32'");
  assert.equal(api.state.calls.length, calls, 'changing language must not refetch Runs');
  assert.equal(await page.evaluate(() => localStorage.getItem('mmt.locale')), 'ja');
  await screenshot('tracking-ja');

  await page.getByRole('button', { name: /^プロジェクト\s/ }).and(page.locator('[aria-haspopup="listbox"]')).click();
  await page.getByRole('option').filter({ hasText: 'プロジェクトを作成' }).click();
  await page.getByLabel('名前', { exact: false }).and(page.locator('#new-project-name')).fill('Draft project');
  await page.locator('#new-project-description').fill('日本語のプロジェクト説明');
  const otherTab = await context.newPage();
  await otherTab.goto(base);
  await otherTab.getByRole('heading', { name: 'Runs', exact: true }).waitFor();
  await switchLanguage(otherTab, 'English');
  await page.getByRole('dialog', { name: 'Create project', exact: true }).waitFor();
  assert.equal(await page.locator('#new-project-name').inputValue(), 'Draft project');
  assert.equal(await page.locator('#new-project-description').inputValue(), '日本語のプロジェクト説明');
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.reload();
  await page.getByLabel('Search', { exact: true }).waitFor();
  assert.equal(await page.locator('html').getAttribute('lang'), 'en');
  await otherTab.close();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: /^Language:/ }).press('ArrowDown');
  await page.getByRole('menuitemradio', { name: 'English', exact: true }).waitFor();
  const menuBounds = await page.getByRole('menu').boundingBox();
  assert.ok(menuBounds.x >= 0 && menuBounds.x + menuBounds.width <= 390, 'language menu must fit the viewport');
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'header must fit the viewport');
  await screenshot('tracking-mobile');
  await page.keyboard.press('Escape');
  assert.equal(await page.getByRole('button', { name: /^Language:/ }).evaluate(button => button === document.activeElement), true);
  await page.setViewportSize({ width: 320, height: 768 });
  await page.getByRole('button', { name: /^Language:/ }).click();
  const narrowMenu = await page.getByRole('menu').boundingBox();
  assert.ok(narrowMenu.x >= 0 && narrowMenu.x + narrowMenu.width <= 320, 'language menu must fit a narrow phone');
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'header must fit a narrow phone');
  assert.deepEqual(pageErrors, []);
  console.log('ML Tracking: language detection, live switching, login/form state, persistence, cross-tab sync and keyboard checks passed');
} finally {
  await browser.close();
}
