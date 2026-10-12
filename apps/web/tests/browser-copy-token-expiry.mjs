import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { createBrowserApi } from './browserApi.mjs';

const modulePath = process.env.MMT_PLAYWRIGHT_MODULE;
if (!modulePath) throw new Error('Set MMT_PLAYWRIGHT_MODULE to an installed Playwright index.mjs');
const { chromium } = await import(pathToFileURL(modulePath).href);
const base = process.env.MMT_WEB_URL ?? 'http://127.0.0.1:5982';
const httpBase = process.env.MMT_WEB_HTTP_URL;
if (!httpBase) throw new Error('Set MMT_WEB_HTTP_URL to a non-loopback HTTP URL of the same test server');
const screenshots = process.env.MMT_SCREENSHOT_DIR;
if (screenshots) await mkdir(screenshots, { recursive: true });
// Two years exercises the former 365-day cap; browser timestamps are compared in milliseconds.
const DAY_MILLISECONDS = 24 * 60 * 60 * 1000;
const CUSTOM_DURATION_DAYS = 730;
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'],
  ...(process.env.MMT_CHROMIUM_PATH ? { executablePath: process.env.MMT_CHROMIUM_PATH } : {}) });
const context = await browser.newContext({ locale: 'ja-JP', viewport: { width: 1440, height: 960 } });
await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: base });
const api = createBrowserApi();
api.state.loggedIn = true;
api.state.user.isAdmin = false;
await context.route(url => url.pathname.startsWith('/api/'), api.route);
const page = await context.newPage();
const reader = await context.newPage();
const pageErrors = [];
page.on('pageerror', error => pageErrors.push(error.message));
const projectPath = `/projects/${api.state.project.id}/settings`;
const guide = page.locator('section.recording-connection');
const projectValue = () => guide.locator('.connection-values > div', { hasText: 'プロジェクトID' });
async function clipboardText() {
  await reader.bringToFront();
  const copiedText = await reader.evaluate(() => navigator.clipboard.readText());
  await page.bringToFront();
  return copiedText;
}

async function copyProjectId() {
  await projectValue().getByRole('button').click();
  await projectValue().getByRole('button', { name: 'コピーしました', exact: true }).waitFor();
  assert.equal(await clipboardText(), api.state.project.id);
}

async function selectOption(scope, label, option) {
  await scope.getByRole('combobox', { name: label, exact: true }).click();
  await scope.getByRole('option', { name: option, exact: true }).click();
}

async function openTokenForm(name) {
  await guide.getByRole('button', { name: 'このProject用のAPI tokenを発行', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('名前').fill(name);
  return dialog;
}

async function closeTokenDialog() {
  await page.getByRole('dialog').getByRole('button', { name: '閉じる', exact: true }).last().click();
}

try {
  await reader.goto(`${base}${projectPath}`);
  await page.goto(`${base}${projectPath}`);
  await page.bringToFront();
  await guide.getByRole('heading', { name: 'SDK・MLflow 3から接続' }).waitFor();

  // Native copying remains available on a secure origin.
  await copyProjectId();

  // A refusal by the native API uses the same fallback, preserving the exact value.
  await page.evaluate(() => {
    navigator.clipboard.writeText = async () => { throw new DOMException('Denied', 'NotAllowedError'); };
  });
  await copyProjectId();
  assert.equal(await projectValue().getByRole('alert').count(), 0);

  await page.goto(`${httpBase}${projectPath}`);
  await guide.getByRole('heading', { name: 'SDK・MLflow 3から接続' }).waitFor();
  assert.deepEqual(await page.evaluate(() => ({ secure: isSecureContext, clipboard: Boolean(navigator.clipboard) })),
    { secure: false, clipboard: false });
  await copyProjectId();
  assert.equal(await page.locator('textarea[aria-hidden=true]').count(), 0);

  // Both rows have identical dimensions with either language selected, including narrow screens.
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 960 });
    for (const language of ['English', '日本語']) {
      await page.getByRole('button', { name: /^(表示言語|Language):/ }).click();
      const menu = page.getByRole('menu');
      const rowBounds = await menu.getByRole('menuitemradio').evaluateAll(rows =>
        rows.map(row => ({ height: row.getBoundingClientRect().height, width: row.getBoundingClientRect().width })));
      assert.deepEqual(rowBounds[0], rowBounds[1], 'selected and unselected language rows must match');
      const menuBounds = await menu.boundingBox();
      assert.ok(menuBounds.x >= 0 && menuBounds.x + menuBounds.width <= width);
      if (screenshots && width === 1440 && language === 'English')
        await menu.screenshot({ path: `${screenshots}/language-menu.png` });
      await menu.getByRole('menuitemradio', { name: language, exact: true }).click();
    }
  }
  await page.setViewportSize({ width: 1440, height: 960 });

  // Error feedback must not move a copy button in a heading with space-between alignment.
  const snippet = guide.locator('.code-snippet', { hasText: '環境変数' }).first();
  const snippetButton = snippet.getByRole('button');
  await snippetButton.scrollIntoViewIfNeeded();
  const beforeFailure = await snippetButton.boundingBox();
  await page.evaluate(() => {
    window.originalExecCommand = document.execCommand.bind(document);
    document.execCommand = () => false;
  });
  await snippetButton.click();
  await snippet.getByRole('alert').getByText('コピーできませんでした', { exact: true }).waitFor();
  assert.deepEqual(await snippetButton.boundingBox(), beforeFailure);
  if (screenshots) await snippet.screenshot({ path: `${screenshots}/copy-failure.png` });
  await page.evaluate(() => { document.execCommand = window.originalExecCommand; });
  await snippetButton.click();
  await snippet.getByRole('button', { name: 'コピーしました', exact: true }).waitFor();
  assert.equal(await snippet.getByRole('alert').count(), 0);
  assert.equal(await clipboardText(), await snippet.locator('pre').innerText(), 'multiline snippets must copy exactly');

  const unlimited = await openTokenForm('browser-unlimited');
  await selectOption(unlimited, '有効期限', '無期限');
  await unlimited.getByRole('button', { name: '保存', exact: true }).click();
  await unlimited.getByText('API tokenは一度だけ表示されます', { exact: false }).waitFor();
  assert.equal(api.state.tokens.at(-1).expiresAt, null);
  await unlimited.getByRole('button', { name: 'tokenをコピー', exact: true }).click();
  assert.equal(await clipboardText(), 'browser-test-value-only', 'HTTP copy must work inside modal dialogs');
  assert.equal(await unlimited.getByRole('alert').count(), 0);
  await closeTokenDialog();

  const custom = await openTokenForm('browser-custom-duration');
  await selectOption(custom, '有効期限', '期間を指定');
  await custom.getByLabel('有効期間', { exact: true }).fill(String(CUSTOM_DURATION_DAYS));
  if (screenshots) {
    const expiryField = await custom.getByRole('combobox', { name: '有効期限', exact: true }).locator('..').boundingBox();
    const durationFields = await custom.locator('.token-expiry-duration').boundingBox();
    await page.screenshot({ path: `${screenshots}/custom-expiry.png`, clip: {
      x: expiryField.x, y: expiryField.y, width: expiryField.width,
      height: durationFields.y + durationFields.height - expiryField.y,
    } });
  }
  await page.setViewportSize({ width: 320, height: 768 });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'custom fields must fit a phone');
  const beforeIssue = Date.now();
  await custom.getByRole('button', { name: '保存', exact: true }).click();
  await custom.getByText('API tokenは一度だけ表示されます', { exact: false }).waitFor();
  const customExpiresAt = Date.parse(api.state.tokens.at(-1).expiresAt);
  assert.ok(customExpiresAt >= beforeIssue + CUSTOM_DURATION_DAYS * DAY_MILLISECONDS);
  assert.ok(customExpiresAt <= Date.now() + CUSTOM_DURATION_DAYS * DAY_MILLISECONDS);
  await closeTokenDialog();

  await page.setViewportSize({ width: 1440, height: 960 });
  const fractional = await openTokenForm('browser-fractional-hours');
  await selectOption(fractional, '有効期限', '期間を指定');
  await fractional.getByLabel('有効期間', { exact: true }).fill('0');
  const issuedCount = api.state.tokens.length;
  await fractional.getByRole('button', { name: '保存', exact: true }).click();
  await fractional.getByRole('alert').waitFor();
  assert.equal(api.state.tokens.length, issuedCount, 'zero duration must not issue a token');
  await fractional.getByLabel('有効期間', { exact: true }).fill('1.5');
  await selectOption(fractional, '単位', '時間');
  const beforeFractionalIssue = Date.now();
  await fractional.getByRole('button', { name: '保存', exact: true }).click();
  await fractional.getByText('API tokenは一度だけ表示されます', { exact: false }).waitFor();
  const fractionalExpiry = Date.parse(api.state.tokens.at(-1).expiresAt);
  assert.ok(fractionalExpiry >= beforeFractionalIssue + 1.5 * DAY_MILLISECONDS / 24);
  assert.ok(fractionalExpiry <= Date.now() + 1.5 * DAY_MILLISECONDS / 24);
  assert.deepEqual(pageErrors, []);
  console.log('copy, failure placement, language dimensions, unlimited and custom token expiry: ok');
} finally {
  await browser.close();
}
