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
const plugin = {
  ...api.state.plugins[0], name: 'Mado', kind: 'mado',
  configRevision: 1, config: null, enabled: false,
  credentialsConfigured: { accessToken: false }, accessTokenGrant: null,
  secretStorageAvailable: true, tokenConfigured: false,
};
// 接続確認のたびにフィクスチャのmado S3 Data Catalogが返す、保存済みのアクセストークンの内容。
const accessTokenGrant = { name: 'ML Tracking', scopes: ['metrics:read'], expiresAt: null };
api.state.plugins = [];
const projectId = api.state.project.id;
const pluginListPath = `/projects/${projectId}/plugins`;
const pluginPath = `${pluginListPath}/${plugin.id}`;
const base = process.env.MMT_WEB_URL ?? 'http://127.0.0.1:6082';
const screenshots = process.env.MMT_SCREENSHOT_DIR;
const calls = [];
const pageErrors = [];
let pluginListGate;
let releasePluginList;
let closing = false;
// 以前の版がmado S3 Data Catalogから取り込んだバージョン。外部参照はこの接続を指す。
const importedExternalId = '10000000-0000-4000-8000-000000000001';
Object.assign(api.state.datasetVersions[0], {
  externalRef: { pluginId: plugin.id, externalId: importedExternalId, namespace: 'review', name: 'dataset-1', version: 'v1' },
});

function manifest() {
  return { id: 'mado', name: 'Mado', version: 'builtin', protocolVersion: '1.0',
    capabilities: accessTokenGrant.scopes.includes('metrics:read') ? ['storage:metrics'] : [] };
}
function saveCredentials(credentials) {
  if (!credentials?.accessToken) return;
  plugin.credentialsConfigured.accessToken = true;
  plugin.tokenConfigured = true;
}

await context.route(url => url.pathname.startsWith('/api/'), async route => {
  const request = route.request();
  const pathname = new URL(request.url()).pathname.replace(/^\/api/, '');
  const method = request.method();
  const body = request.headers()['content-type']?.includes('application/json') ? request.postDataJSON() : {};
  calls.push({ pathname, method });
  const reply = payload => route.fulfill({ contentType: 'application/json', body: JSON.stringify(payload) })
    .catch(error => { if (!closing) throw error; });
  if (pathname === pluginListPath && method === 'GET') {
    if (pluginListGate) await pluginListGate;
    return reply({ items: api.state.plugins });
  }
  if (pathname === pluginListPath && method === 'POST') {
    assert.equal(body.kind, 'mado');
    assert.equal(body.enabled, false, 'Initial registration must remain disabled');
    if (api.state.plugins.length) {
      const added = { ...plugin, id: '20000000-0000-4000-8000-000000000002',
        name: body.name, config: body.config, configRevision: 1, enabled: false, manifest: null,
        accessTokenGrant: null, tokenConfigured: false, credentialsConfigured: { accessToken: false } };
      api.state.plugins.push(added);
      return reply(added);
    }
    Object.assign(plugin, { name: body.name, config: body.config });
    saveCredentials(body.credentials);
    api.state.plugins = [plugin];
    return reply(plugin);
  }
  if (pathname === pluginPath && method === 'PATCH') {
    assert.equal(Object.hasOwn(body, 'baseUrl'), false);
    assert.equal(Object.hasOwn(body, 'tokenEnv'), false);
    if (body.config)
      assert.deepEqual(Object.keys(body.config).sort(), ['apiUrl', 'webUrl'], 'Only the API and Web URLs are configured');
    if (body.config || body.credentials) {
      assert.equal(body.expectedRevision, plugin.configRevision);
      plugin.configRevision++;
      plugin.manifest = null;
      plugin.accessTokenGrant = null;
    }
    if (body.config) plugin.config = body.config;
    if (body.name) plugin.name = body.name;
    if (Object.hasOwn(body, 'enabled')) plugin.enabled = body.enabled;
    saveCredentials(body.credentials);
    return reply(plugin);
  }
  if (pathname === `${pluginPath}/check`) {
    plugin.manifest = manifest();
    plugin.accessTokenGrant = accessTokenGrant;
    return reply(plugin);
  }
  return api.route(route);
});

const page = await context.newPage();
page.on('pageerror', error => pageErrors.push(error.message));
const dialog = () => page.getByRole('dialog').last();
const storageMetrics = () => page.locator('.storage-metrics');
const metricsCalls = () => calls.filter(call => call.pathname.endsWith('/metrics')).length;
async function switchLanguage(name, target = page) {
  await target.getByRole('button', { name: /^(Language|表示言語):/ }).click();
  await target.getByRole('menuitemradio', { name, exact: true }).click();
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
async function editConnection(field, value) {
  await page.getByRole('button', { name: 'Madoの接続設定', exact: true }).click();
  await dialog().getByLabel(field).fill(value);
  pluginListGate = new Promise(resolve => { releasePluginList = resolve; });
  await dialog().getByRole('button', { name: '保存', exact: true }).click();
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  assert.equal(await storageMetrics().count(), 0, 'Saved settings must discard the earlier capacity before the GET finishes');
  pluginListGate = undefined;
  releasePluginList();
  await page.getByRole('button', { name: '再読み込み', exact: true }).waitFor();
}

try {
  console.log('Built-in Mado: unconfigured card, disabled registration and explicit connection check');
  await page.goto(`${base}/projects/${projectId}/plugins`);
  await page.getByText('Mado連携は未設定・無効です。', { exact: false }).waitFor();
  assert.equal(calls.some(call => /\/(check|metrics)$/.test(call.pathname)), false);
  await screenshot('mado-unconfigured-ja');
  await page.getByRole('button', { name: 'Madoの接続設定', exact: true }).click();
  for (const removed of ['OpenLineage URL', 'RunのNamespace', 'ストレージの識別名'])
    assert.equal(await dialog().getByLabel(removed).count(), 0, `${removed} is no longer configured`);
  await dialog().getByLabel('Mado API URL').fill('http://mado-api.invalid');
  await dialog().getByLabel('Mado Web URL').fill('https://mado-web.invalid');
  await dialog().getByLabel('アクセストークン').fill('browser-access-fixture');
  const languageTab = await context.newPage();
  await languageTab.goto(`${base}/projects/${projectId}/plugins`);
  await languageTab.getByRole('heading', { name: '連携', exact: true }).waitFor();
  await switchLanguage('English', languageTab);
  assert.equal(await dialog().getByLabel('Mado API URL').inputValue(), 'http://mado-api.invalid');
  assert.equal(await dialog().getByLabel('Access token').inputValue(), 'browser-access-fixture');
  await switchLanguage('日本語', languageTab);
  await languageTab.close();
  await screenshot('mado-settings-dialog-ja');
  await dialog().getByRole('button', { name: '保存', exact: true }).click();
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  assert.equal(plugin.enabled, false);
  assert.equal(await page.getByText('接続を確認すると表示します', { exact: true }).count(), 2,
    'Permissions and expiration are unknown until the connection is checked');
  await checkConnection();
  await page.getByText('Capacityの読み取り', { exact: true }).waitFor();
  await page.getByText('無期限', { exact: true }).waitFor();
  assert.equal(await storageMetrics().count(), 0, 'Disabled integration must not fetch metrics automatically');
  assert.equal(metricsCalls(), 0);
  await screenshot('mado-checked-ja');
  await page.getByRole('button', { name: 'Madoの接続設定', exact: true }).click();
  assert.equal(await dialog().getByLabel('アクセストークン').inputValue(), '', 'Saved tokens must not be returned to the browser');
  await dialog().getByRole('button', { name: 'キャンセル', exact: true }).click();
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  await page.getByTestId('plugin-toggle').click();
  await page.getByRole('button', { name: '連携を無効にする', exact: true }).waitFor();
  assert.equal(await storageMetrics().count(), 0, 'Capacity is shown only after the enabled connection is checked');
  await checkConnection();
  await storageMetrics().getByRole('heading', { name: 'UI検証ストレージ', exact: true }).waitFor();
  assert.equal(await page.getByLabel('データセットを検索', { exact: true }).count(), 0);
  assert.equal(await page.getByRole('button', { name: 'イベントを再送', exact: true }).count(), 0);
  assert.equal(await page.getByText('イベントの送信状況', { exact: true }).count(), 0);
  await switchLanguage('English');
  await storageMetrics().getByRole('heading', { name: 'UI検証ストレージ', exact: true }).waitFor();
  await page.getByText('Capacity Read', { exact: true }).waitFor();
  await screenshot('mado-configured-en');
  await switchLanguage('日本語');

  console.log('Built-in Mado: a replaced token is checked again before its capacity is shown');
  await editConnection('アクセストークン', 'browser-replacement-fixture');
  assert.equal(await page.getByText('接続を確認すると表示します', { exact: true }).count(), 2,
    'A replaced token must be checked again before its permissions are shown');
  const callsBeforeCheck = metricsCalls();
  assert.equal(await storageMetrics().count(), 0);
  await checkConnection();
  await storageMetrics().getByRole('heading', { name: 'UI検証ストレージ', exact: true }).waitFor();
  // 確認のあとで初めて容量を取りに行く。画面の読み直しで回数は増えうるので、回数そのものは決めない。
  assert.ok(metricsCalls() > callsBeforeCheck, 'Capacity is requested only after the replaced token is checked');
  await page.getByTestId('plugin-toggle').click();
  await page.getByRole('button', { name: '連携を有効にする', exact: true }).waitFor();
  assert.equal(await page.getByRole('button', { name: '接続を確認', exact: true }).isDisabled(), false);
  assert.equal(await storageMetrics().count(), 0, 'A disabled integration must not show capacity');
  await page.getByTestId('plugin-toggle').click();
  await page.getByRole('button', { name: '連携を無効にする', exact: true }).waitFor();
  await checkConnection();
  await storageMetrics().getByRole('heading', { name: 'UI検証ストレージ', exact: true }).waitFor();

  console.log('Built-in Mado: an external settings change discards the checked capacity');
  plugin.configRevision++;
  plugin.manifest = null;
  plugin.accessTokenGrant = null;
  await page.getByRole('button', { name: '再読み込み', exact: true }).click();
  await page.getByText('接続を確認すると表示します', { exact: true }).first().waitFor();
  assert.equal(await storageMetrics().count(), 0);
  await checkConnection();
  await storageMetrics().getByRole('heading', { name: 'UI検証ストレージ', exact: true }).waitFor();

  console.log('Built-in Mado: an imported version shows its external reference without a link to Mado');
  api.state.user.isAdmin = false;
  api.state.project.role = 'viewer';
  await page.goto(`${base}/projects/${projectId}/datasets?version=${api.state.datasetVersions[0].id}`);
  await page.getByRole('heading', { name: '外部参照', exact: true }).waitFor();
  await page.getByText(importedExternalId, { exact: false }).first().waitFor();
  assert.equal(await page.getByRole('link', { name: 'Madoで見る', exact: true }).count(), 0);
  assert.equal(await page.getByRole('link', { name: 'Madoからインポート', exact: true }).count(), 0);
  assert.equal(await page.locator('a[href*="mado-web.invalid"]').count(), 0);
  assert.equal(calls.some(call => call.pathname.endsWith('/plugins/availability')), false);
  await screenshot('mado-viewer-version-ja');

  api.state.user.isAdmin = true;
  api.state.project.role = 'admin';
  await page.goto(`${base}/projects/${projectId}/plugins`);

  console.log('Built-in Mado: adding a disabled connection preserves earlier connections and references');
  await page.getByRole('button', { name: 'Madoの接続を追加', exact: true }).click();
  await page.getByRole('button', { name: 'Madoの接続設定', exact: true }).click();
  await dialog().getByLabel('名前').fill('Secondary Mado');
  await dialog().getByLabel('Mado API URL').fill('https://secondary-api.invalid');
  await dialog().getByLabel('Mado Web URL').fill('https://secondary-web.invalid');
  await dialog().getByRole('button', { name: '保存', exact: true }).click();
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  await page.getByRole('heading', { name: 'Secondary Mado', exact: true }).waitFor();
  assert.equal(api.state.plugins.length, 2);
  assert.equal(api.state.plugins[0].id, plugin.id);
  assert.notEqual(api.state.plugins[1].id, plugin.id);
  assert.equal(api.state.plugins[1].enabled, false);
  assert.equal(api.state.datasetVersions[0].externalRef.pluginId, plugin.id);

  api.state.user.isAdmin = true;
  await page.goto(`${base}/projects/${projectId}/plugins?id=${plugin.id}`);
  await page.getByRole('button', { name: 'Madoの接続設定', exact: true }).waitFor();
  await page.setViewportSize({ width: 320, height: 768 });
  const settingsBounds = await page.getByRole('button', { name: 'Madoの接続設定', exact: true }).boundingBox();
  assert.ok(settingsBounds.x >= 0 && settingsBounds.x + settingsBounds.width <= 320,
    'Connection settings must remain reachable on a narrow phone');
  await screenshot('mado-mobile-ja');
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  assert.deepEqual(pageErrors, []);
  console.log('Built-in Mado browser checks passed.');
} finally {
  closing = true;
  releasePluginList?.();
  await browser.close();
}
