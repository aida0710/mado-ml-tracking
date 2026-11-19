import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { createBrowserApi } from './browserApi.mjs';

const modulePath = process.env.MMT_PLAYWRIGHT_MODULE;
if (!modulePath) throw new Error('Set MMT_PLAYWRIGHT_MODULE to an installed Playwright index.mjs');
const { chromium } = await import(pathToFileURL(modulePath).href);
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'],
  ...(process.env.MMT_CHROMIUM_PATH ? { executablePath: process.env.MMT_CHROMIUM_PATH } : {}) });
const context = await browser.newContext({ locale: 'ja-JP', viewport: { width: 1440, height: 960 } });
const api = createBrowserApi();
api.state.loggedIn = true;
const dataCatalog = api.state.dataCatalog;
const projectId = api.state.project.id;
const base = process.env.MMT_WEB_URL ?? 'http://127.0.0.1:6082';
const screenshots = process.env.MMT_SCREENSHOT_DIR;
const DATA_CATALOG_URL = 'https://catalog.example.test';
const PLUGINS_PATH = '/settings/plugins';
const pageErrors = [];

await context.route((url) => url.pathname.startsWith('/api/'), (route) => api.route(route));

const page = await context.newPage();
page.on('pageerror', (error) => pageErrors.push(error.message));
const dialog = () => page.getByRole('dialog').last();
const dataCatalogSection = () => page.getByRole('region', { name: 'mado S3 Data Catalog', exact: true });
const capacity = () => page.getByRole('region', { name: 'ストレージの容量', exact: true });
const dataCatalogCalls = (method, suffix = '') =>
  api.state.calls.filter(
    (call) => call.method === method && call.path === `/admin/plugins/data-catalog${suffix}`,
  );
async function switchLanguage(name) {
  await page.getByRole('button', { name: /^(Language|表示言語):/ }).click();
  await page.getByRole('menuitemradio', { name, exact: true }).click();
}
async function screenshot(name) {
  if (!screenshots) return;
  await mkdir(screenshots, { recursive: true });
  await page.screenshot({ path: `${screenshots}/${name}.png`, fullPage: true });
}
async function checkConnection() {
  await page.getByRole('button', { name: '接続を確認', exact: true }).click();
  await page.getByRole('status').filter({ hasText: '接続を確認しました' }).waitFor();
}

try {
  console.log('Plugins: the project sidebar ends with one entry to the global settings');
  await page.goto(`${base}/projects/${projectId}/experiments`);
  const sidebar = page.locator('.navigation-sidebar');
  const sidebarLinks = sidebar.getByRole('link');
  // Projectを読み込むまでは、サイドバーにProjectの画面が並ばない。
  await sidebar.getByRole('link', { name: 'Experiments', exact: true }).waitFor();
  assert.equal(await sidebarLinks.last().textContent(), '全体設定');
  assert.equal(await sidebar.getByRole('link', { name: '連携', exact: true }).count(), 0,
    'The per-project integration screen is gone');
  await screenshot('project-sidebar-ja');
  await sidebarLinks.last().click();
  await page.waitForURL(`${base}/settings/account`);
  await page.getByRole('link', { name: 'Plugins', exact: true }).click();
  await page.waitForURL(`${base}${PLUGINS_PATH}`);

  console.log('Plugins: unconnected, nothing is sent to mado S3 Data Catalog until the administrator connects');
  await page.getByRole('heading', { name: 'Plugins', exact: true, level: 1 }).waitFor();
  await dataCatalogSection().getByText('未接続', { exact: true }).waitFor();
  assert.equal(await capacity().count(), 0);
  assert.equal(dataCatalogCalls('GET', '/capacity').length, 0);
  await screenshot('plugins-unconnected-ja');

  console.log('Plugins: one dialog with one URL and the access token connects and shows capacity at once');
  await page.getByRole('button', { name: 'mado S3 Data Catalogに接続', exact: true }).click();
  for (const removed of ['名前', 'Mado API URL', 'Mado Web URL', 'OpenLineage URL', 'RunのNamespace', 'ストレージの識別名'])
    assert.equal(await dialog().getByLabel(removed, { exact: true }).count(), 0, `${removed} is no longer entered`);
  await dialog().getByLabel('URL').fill(DATA_CATALOG_URL);
  await dialog().getByLabel('アクセストークン').fill('browser-access-fixture');
  await screenshot('plugins-connect-dialog-ja');

  dataCatalog.connectFailure = {
    status: 422, code: 'data_catalog_access_token_rejected',
    error: 'mado S3 Data Catalog rejected the access token; check that it is correct and has not expired',
  };
  await dialog().getByRole('button', { name: '接続', exact: true }).click();
  await dialog().getByRole('alert').filter({ hasText: 'rejected the access token' }).waitFor();
  assert.equal(dataCatalog.connection, null, 'A connection that failed its check is not saved');
  assert.equal(await dialog().getByLabel('アクセストークン').inputValue(), 'browser-access-fixture',
    'A failed check keeps the entered values so that they can be corrected');
  dataCatalog.connectFailure = null;

  await dialog().getByRole('button', { name: '接続', exact: true }).click();
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  assert.deepEqual(dataCatalogCalls('PUT').at(-1).body, { url: DATA_CATALOG_URL, accessToken: 'browser-access-fixture' });
  await dataCatalogSection().getByText('接続済み', { exact: true }).waitFor();
  await dataCatalogSection().getByRole('link', { name: DATA_CATALOG_URL, exact: true }).waitFor();
  await page.getByText('Capacityの読み取り', { exact: true }).waitFor();
  await page.getByText('無期限', { exact: true }).waitFor();
  // 保存と同時に確かめてあるので、もう一度確認しなくても容量が出る。
  await capacity().getByRole('heading', { name: 'UI検証ストレージ', exact: true }).waitFor();
  // formatBytesは小数1桁で表す（lib/format.ts）。3221225472バイトは'3.0 GiB'になる。
  await capacity().getByText('3.0 GiB', { exact: true }).waitFor();
  assert.equal(await page.getByRole('button', { name: /有効にする|無効にする/ }).count(), 0,
    'There is no separate step to enable the connection');
  await screenshot('plugins-connected-ja');

  console.log('Plugins: capacity shows unmeasured buckets, raw text, failures and the empty state');
  assert.deepEqual(
    await capacity().locator('tr').filter({ hasText: 'unmeasured' }).locator('td').allTextContents(),
    ['unmeasured', '—', '—', '—', '2'],
  );
  assert.equal(await capacity().locator('.raw-metrics').getAttribute('open'), null);
  await capacity().locator('.raw-metrics summary').click();
  assert.ok((await capacity().locator('pre').textContent()).includes('mado_storage_prefix_bytes'));
  dataCatalog.failCapacity = true;
  await capacity().getByRole('button', { name: '容量を更新', exact: true }).click();
  await capacity().getByRole('alert').filter({ hasText: 'capacity unavailable' }).waitFor();
  assert.equal(await capacity().locator('table').count(), 0, 'A failed read must not keep showing earlier values');
  dataCatalog.failCapacity = false;
  await capacity().getByRole('button', { name: '再試行', exact: true }).click();
  await capacity().getByText('3.0 GiB', { exact: true }).waitFor();
  const measuredPrometheus = api.state.prometheus;
  api.state.prometheus = '';
  await capacity().getByRole('button', { name: '容量を更新', exact: true }).click();
  await capacity().getByText('容量メトリクスはまだありません', { exact: true }).waitFor();
  api.state.prometheus = measuredPrometheus;
  await capacity().getByRole('button', { name: '容量を更新', exact: true }).click();
  await capacity().getByText('3.0 GiB', { exact: true }).waitFor();

  console.log('Plugins: the stored token never returns to the browser, and a blank token keeps it');
  await page.getByRole('button', { name: '接続を変更', exact: true }).click();
  assert.equal(await dialog().getByLabel('URL').inputValue(), DATA_CATALOG_URL);
  assert.equal(await dialog().getByLabel('アクセストークン').inputValue(), '');
  await dialog().getByRole('button', { name: '接続', exact: true }).click();
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  assert.deepEqual(dataCatalogCalls('PUT').at(-1).body, { url: DATA_CATALOG_URL },
    'A blank access token must not be sent');
  await capacity().getByText('3.0 GiB', { exact: true }).waitFor();

  console.log('Plugins: checking again reads permissions changed in mado S3 Data Catalog');
  dataCatalog.accessTokenGrant = { ...dataCatalog.accessTokenGrant, scopes: [] };
  await checkConnection();
  await page.getByText('このアクセストークンでは容量を読めません。', { exact: false }).waitFor();
  assert.equal(await capacity().count(), 0);
  const callsSinceCheck = api.state.calls.slice(api.state.calls.lastIndexOf(dataCatalogCalls('PUT').at(-1)));
  assert.equal(callsSinceCheck.some((call) => call.path.endsWith('/capacity')), false,
    'Capacity is not requested with a token that cannot read it');
  await screenshot('plugins-capacity-not-permitted-ja');
  dataCatalog.accessTokenGrant = { ...dataCatalog.accessTokenGrant, scopes: ['metrics:read'] };
  await checkConnection();
  await capacity().getByText('3.0 GiB', { exact: true }).waitFor();

  console.log('Plugins: English');
  await switchLanguage('English');
  await page.getByRole('region', { name: 'mado S3 Data Catalog', exact: true }).getByText('Connected', { exact: true }).waitFor();
  await page.getByText('Capacity read', { exact: true }).waitFor();
  await page.getByRole('region', { name: 'Storage capacity', exact: true })
    .getByRole('heading', { name: 'UI検証ストレージ', exact: true }).waitFor();
  await screenshot('plugins-connected-en');
  await switchLanguage('日本語');

  console.log('Plugins: a narrow phone keeps every action reachable');
  await page.setViewportSize({ width: 320, height: 768 });
  for (const name of ['接続を確認', '接続を変更', '接続を解除']) {
    const bounds = await page.getByRole('button', { name, exact: true }).boundingBox();
    assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= 320, `${name} must stay inside a narrow phone`);
  }
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await screenshot('plugins-mobile-ja');
  await page.setViewportSize({ width: 1440, height: 960 });

  console.log('Plugins: disconnecting asks first, then removes the connection');
  await page.getByRole('button', { name: '接続を解除', exact: true }).click();
  await dialog().getByText('保存したアクセストークンを消します。', { exact: false }).waitFor();
  await dialog().getByRole('button', { name: '接続を解除', exact: true }).click();
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  await dataCatalogSection().getByText('未接続', { exact: true }).waitFor();
  assert.equal(dataCatalog.connection, null);
  assert.equal(await capacity().count(), 0);

  console.log('Plugins: without the storage key the administrator is told why connecting is unavailable');
  dataCatalog.secretStorageAvailable = false;
  await page.getByRole('button', { name: '再読み込み', exact: true }).click();
  await page.getByText('APIサーバーにMMT_PLUGIN_SECRET_KEYの設定が必要です', { exact: false }).waitFor();
  assert.equal(await page.getByRole('button', { name: 'mado S3 Data Catalogに接続', exact: true }).isDisabled(), true);
  await screenshot('plugins-secret-storage-missing-ja');
  dataCatalog.secretStorageAvailable = true;

  console.log('Plugins: only global administrators reach the screen');
  api.state.user.isAdmin = false;
  api.state.project.role = 'admin';
  await page.goto(`${base}${PLUGINS_PATH}`);
  await page.waitForURL(`${base}/settings/account`);
  await page.getByText('開こうとした画面は全体管理者だけが使えます。', { exact: false }).waitFor();
  assert.equal(await page.getByRole('link', { name: 'Plugins', exact: true }).count(), 0);
  await page.goto(`${base}/projects/${projectId}/experiments`);
  await page.getByRole('link', { name: '全体設定', exact: true }).waitFor();
  assert.equal(await page.getByRole('link', { name: '連携', exact: true }).count(), 0);

  assert.deepEqual(pageErrors, []);
  console.log('Plugins browser checks passed.');
} finally {
  await browser.close();
}
