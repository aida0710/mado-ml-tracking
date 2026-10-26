import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { createBrowserApi } from './browserApi.mjs';
import { waitForNoHorizontalOverflow } from './viewportOverflow.mjs';

const modulePath = process.env.MMT_PLAYWRIGHT_MODULE;
if (!modulePath) throw new Error('Set MMT_PLAYWRIGHT_MODULE to an installed Playwright index.mjs');
const { chromium } = await import(pathToFileURL(modulePath).href);
const base = process.env.MMT_WEB_URL ?? 'http://127.0.0.1:5982';
// LANのIPをHTTPで開いたときと同じく安全でないorigin（isSecureContextがfalseでClipboard APIが無い）。
// ブラウザにはこのoriginとして見せ、中身は同じWebサーバ（MMT_WEB_URL）からPlaywrightが取ってくるので、
// サーバを127.0.0.1の外へ開かずに確かめられる。.testは名前解決されない検証用の名前（RFC 6761）。
const insecureOrigin = 'http://mmt-web.test';
const screenshots = process.env.MMT_SCREENSHOT_DIR;
if (screenshots) await mkdir(screenshots, { recursive: true });
// 2年にして、以前の365日の上限を試す。ブラウザの時刻はミリ秒で比べる。
const DAY_MILLISECONDS = 24 * 60 * 60 * 1000;
const CUSTOM_DURATION_DAYS = 730;
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'],
  ...(process.env.MMT_CHROMIUM_PATH ? { executablePath: process.env.MMT_CHROMIUM_PATH } : {}) });
const context = await browser.newContext({ locale: 'ja-JP', timezoneId: 'Asia/Tokyo', viewport: { width: 1440, height: 960 } });
await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: base });
const api = createBrowserApi();
api.state.loggedIn = true;
api.state.user.isAdmin = false;
await context.route(url => url.pathname.startsWith('/api/'), api.route);
await context.route(
  url => url.origin === insecureOrigin && !url.pathname.startsWith('/api/'),
  async route => {
    const url = route.request().url().replace(insecureOrigin, new URL(base).origin);
    await route.fulfill({ response: await route.fetch({ url }) });
  },
);
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

async function saveToken(dialog) {
  await dialog.getByRole('button', { name: '保存', exact: true }).click();
  await dialog.getByText('API tokenは一度だけ表示されます', { exact: false }).waitFor();
  return api.state.tokens.at(-1);
}

try {
  await reader.goto(`${base}${projectPath}`);
  await page.goto(`${base}${projectPath}`);
  await page.bringToFront();
  await guide.getByRole('heading', { name: 'SDK・MLflow 3から接続' }).waitFor();

  // 安全なoriginでは、ブラウザ標準のコピーを引き続き使える。
  await copyProjectId();

  // ブラウザ標準のAPIが断ったときも同じ代わりのコピー手段を使い、値をそのまま保つ。
  await page.evaluate(() => {
    navigator.clipboard.writeText = async () => { throw new DOMException('Denied', 'NotAllowedError'); };
  });
  await copyProjectId();
  assert.equal(await projectValue().getByRole('alert').count(), 0);

  await page.goto(`${insecureOrigin}${projectPath}`);
  await guide.getByRole('heading', { name: 'SDK・MLflow 3から接続' }).waitFor();
  assert.deepEqual(await page.evaluate(() => ({ secure: isSecureContext, clipboard: Boolean(navigator.clipboard) })),
    { secure: false, clipboard: false });
  await copyProjectId();
  assert.equal(await page.locator('textarea[aria-hidden=true]').count(), 0);

  // どちらの言語を選んでいても、狭い画面を含め、2つの行は同じ大きさになる。
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

  // コピーの失敗は、ボタンの名前の代わりに結果を出す（成功と同じく1.5秒で戻る）。
  const snippet = guide.locator('.code-snippet', { hasText: '環境変数' }).first();
  const snippetButton = snippet.getByRole('button');
  await snippetButton.scrollIntoViewIfNeeded();
  await page.evaluate(() => {
    window.originalExecCommand = document.execCommand.bind(document);
    document.execCommand = () => false;
  });
  await snippetButton.click();
  await snippet.getByRole('button', { name: 'コピーできませんでした', exact: true }).waitFor();
  if (screenshots) await snippet.screenshot({ path: `${screenshots}/copy-failure.png` });
  await page.evaluate(() => { document.execCommand = window.originalExecCommand; });
  await snippetButton.click();
  await snippet.getByRole('button', { name: 'コピーしました', exact: true }).waitFor();
  assert.equal(await clipboardText(), await snippet.locator('pre').innerText(), 'multiline snippets must copy exactly');

  const unlimited = await openTokenForm('browser-unlimited');
  await selectOption(unlimited, '有効期限', '無期限');
  assert.equal((await saveToken(unlimited)).expiresAt, null);
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
  await waitForNoHorizontalOverflow(page, 'custom fields must fit a phone');
  const beforeIssue = Date.now();
  const customExpiresAt = Date.parse((await saveToken(custom)).expiresAt);
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
  const fractionalExpiry = Date.parse((await saveToken(fractional)).expiresAt);
  assert.ok(fractionalExpiry >= beforeFractionalIssue + 1.5 * DAY_MILLISECONDS / 24);
  assert.ok(fractionalExpiry <= Date.now() + 1.5 * DAY_MILLISECONDS / 24);
  await closeTokenDialog();

  const calendar = await openTokenForm('browser-calendar-expiry');
  await selectOption(calendar, '有効期限', 'カレンダーで指定');
  const dateTimeInput = calendar.getByLabel('有効期限の日時', { exact: true });
  assert.equal(await dateTimeInput.getAttribute('type'), 'datetime-local');
  assert.ok(await dateTimeInput.evaluate(input => input.validity.valid), 'the calendar starts with a valid expiry');
  await calendar.getByText('時刻はAsia/Tokyoで指定します。', { exact: true }).waitFor();
  await dateTimeInput.fill('2027-12-31T23:59');
  await selectOption(calendar, '有効期限', '無期限');
  await selectOption(calendar, '有効期限', 'カレンダーで指定');
  assert.equal(await dateTimeInput.inputValue(), '2027-12-31T23:59', 'switching options must keep the chosen date');
  const beforeCalendarIssue = api.state.tokens.length;
  await dateTimeInput.fill('2000-01-01T00:00');
  await calendar.getByRole('button', { name: '保存', exact: true }).click();
  assert.equal(await dateTimeInput.evaluate(input => input.validity.rangeUnderflow), true);
  assert.equal(api.state.tokens.length, beforeCalendarIssue, 'a past date must not issue a token');
  await dateTimeInput.fill('');
  await calendar.getByRole('button', { name: '保存', exact: true }).click();
  assert.equal(await dateTimeInput.evaluate(input => input.validity.valueMissing), true);
  assert.equal(api.state.tokens.length, beforeCalendarIssue, 'an empty calendar must not issue a token');
  await dateTimeInput.fill('2027-12-31T23:59');
  await page.setViewportSize({ width: 320, height: 768 });
  await waitForNoHorizontalOverflow(page, 'the calendar must fit a phone');
  await page.setViewportSize({ width: 1440, height: 960 });
  await dateTimeInput.scrollIntoViewIfNeeded();
  if (screenshots) {
    const expiryField = await calendar.getByRole('combobox', { name: '有効期限', exact: true }).locator('..').boundingBox();
    const calendarField = await calendar.locator('.token-expiry-calendar').boundingBox();
    await page.screenshot({ path: `${screenshots}/calendar-expiry.png`, clip: {
      x: expiryField.x, y: expiryField.y, width: expiryField.width,
      height: calendarField.y + calendarField.height - expiryField.y,
    } });
  }
  assert.equal((await saveToken(calendar)).expiresAt, '2027-12-31T14:59:00.000Z', 'JST selection must become the exact UTC expiry');
  assert.deepEqual(pageErrors, []);
  console.log('copy, failure placement, language dimensions, unlimited, duration and calendar token expiry: ok');
} finally {
  await browser.close();
}
