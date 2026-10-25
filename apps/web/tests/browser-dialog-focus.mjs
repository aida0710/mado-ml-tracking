// ブラウザでの確認。フォームのダイアログ、独自のダイアログ、確認のダイアログのどれでも、閉じたとき
// （Esc、×、取消のボタン）に、開いたボタンへフォーカスが戻る。ダイアログのフォームの中にある長い
// チェックボックスの一覧で、絞り込み欄でEnterを押すと、送信せずに一覧を絞り込む。
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
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
const context = await browser.newContext({ locale: 'ja-JP', viewport: { width: 1440, height: 900 } });
const api = createBrowserApi();
api.state.loggedIn = true;
await context.route((url) => url.pathname.startsWith('/api/'), api.route);
const page = await context.newPage();
const pageErrors = [];
page.on('pageerror', (error) => pageErrors.push(error.message));
const base = process.env.MMT_WEB_URL ?? 'http://127.0.0.1:5182';
const projectBase = `${base}/projects/${api.state.project.id}`;
const openDialog = page.locator('dialog[open]');

// ダイアログをそのボタンからキーボードで開き、`close`で閉じ、その後で同じボタンにフォーカスが
// あるかを返す。
async function focusReturnsAfter({ path, opener, close }) {
  await page.goto(path);
  // 画面は一覧が届くたびにボタンを描き直すので、描き終えてからボタンに印を付ける。
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

  console.log('Browser check: Enter in the filter of a long checkbox list does not submit the form');
  {
    const [firstVersion] = api.state.datasetVersions;
    // チェックボックスの一覧が絞り込み欄なしで出せる数より多いバージョン（FILTERABLE_OPTION_COUNTは8）。
    for (let index = 2; index <= 10; index += 1)
      api.state.datasetVersions.push({ ...firstVersion, id: randomUUID(), version: `v${index}` });
    const isVersionCreation = (request) =>
      request.method() === 'POST' && request.url().includes(`/datasets/${firstVersion.datasetId}/versions`);
    const versionCreations = [];
    page.on('request', (request) => {
      if (isVersionCreation(request)) versionCreations.push(request.url());
    });
    await page.goto(`${projectBase}/datasets`);
    await page.getByRole('button', { name: 'バージョンを作成', exact: true }).click();
    await openDialog.waitFor();
    await openDialog.getByRole('textbox', { name: /^バージョン/ }).fill('v-enter');
    await openDialog.getByRole('textbox', { name: /^URI/ }).fill('s3://bucket/enter/');
    await openDialog.getByRole('textbox', { name: /^Digest/ }).fill(`sha256:${'0'.repeat(64)}`);
    const filter = openDialog.getByRole('searchbox', { name: '絞り込み' });
    await filter.fill('v1');
    await filter.press('Enter');
    assert.equal(await openDialog.count(), 1, 'the dialog stays open');
    // バージョンを作るのは保存のボタンだけ。その前に押したEnterでは何も送っていない。
    const created = page.waitForRequest(isVersionCreation);
    await openDialog.locator('footer button.primary').click();
    await created;
    assert.equal(versionCreations.length, 1, 'Enter in the filter did not submit the form');
  }

  assert.deepEqual(pageErrors, []);
  console.log('Dialog focus browser checks passed.');
} finally {
  await browser.close();
}
