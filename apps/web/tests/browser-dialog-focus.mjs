// Browser check: when a dialog closes (Esc, ×, or its cancel button), focus goes back to the button
// that opened it, for a form dialog, a dialog of its own and a confirmation.
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
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const api = createBrowserApi();
api.state.loggedIn = true;
await context.route((url) => url.pathname.startsWith('/api/'), api.route);
const page = await context.newPage();
const pageErrors = [];
page.on('pageerror', (error) => pageErrors.push(error.message));
const base = process.env.MMT_WEB_URL ?? 'http://127.0.0.1:5182';
const projectBase = `${base}/projects/${api.state.project.id}`;
const openDialog = page.locator('dialog[open]');

// Opens the dialog from its button with the keyboard, closes it with `close`, and returns whether
// the same button has focus afterwards.
async function focusReturnsAfter({ path, opener, close }) {
  await page.goto(path);
  // Screens draw their buttons again as their lists arrive; mark the button once they have.
  await page.waitForLoadState('networkidle');
  const button = opener();
  await button.waitFor();
  await button.evaluate((element) => element.setAttribute('data-opener', ''));
  await button.focus();
  await page.keyboard.press('Enter');
  await openDialog.waitFor();
  await close();
  await openDialog.waitFor({ state: 'detached' });
  return page.evaluate(() => document.activeElement?.hasAttribute('data-opener') ?? false);
}
const pressEscape = () => page.keyboard.press('Escape');
const clickClose = () => openDialog.locator('header').getByRole('button', { name: '閉じる', exact: true }).click();
const clickCancel = () => openDialog.getByRole('button', { name: 'キャンセル', exact: true }).click();

try {
  console.log('Browser check: focus returns from a form dialog');
  const experimentDialog = {
    path: `${projectBase}/experiments`,
    opener: () => page.getByRole('button', { name: '実験を作成', exact: true }),
  };
  assert.equal(await focusReturnsAfter({ ...experimentDialog, close: pressEscape }), true, 'Esc');
  assert.equal(await focusReturnsAfter({ ...experimentDialog, close: clickClose }), true, '×');
  assert.equal(await focusReturnsAfter({ ...experimentDialog, close: clickCancel }), true, 'cancel');

  console.log('Browser check: focus returns from a dialog of its own');
  const runDialog = {
    path: `${projectBase}/experiments`,
    opener: () => page.getByRole('button', { name: 'Runを作成', exact: true }),
  };
  assert.equal(await focusReturnsAfter({ ...runDialog, close: pressEscape }), true, 'Esc');
  assert.equal(await focusReturnsAfter({ ...runDialog, close: clickClose }), true, '×');

  console.log('Browser check: focus returns from a confirmation');
  const archiveConfirmation = {
    path: `${base}/settings/projects`,
    opener: () => page.getByRole('button', { name: 'アーカイブ', exact: true }).first(),
  };
  assert.equal(await focusReturnsAfter({ ...archiveConfirmation, close: pressEscape }), true, 'Esc');
  assert.equal(await focusReturnsAfter({ ...archiveConfirmation, close: clickCancel }), true, 'cancel');

  assert.deepEqual(pageErrors, []);
  console.log('Dialog focus browser checks passed.');
} finally {
  await browser.close();
}
