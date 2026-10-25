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
  secretStorageAvailable: true, tokenConfigured: false, baseUrl: '', tokenEnv: '',
};
// 接続確認のたびにフィクスチャのmado S3 Data Catalogが返す、保存済みのアクセストークンの内容。
const accessTokenGrant = {
  name: 'ML Tracking', scopes: ['lineage:read', 'lineage:write', 'metrics:read'],
  namespaces: ['mado-model-tracking', 'review'], expiresAt: null,
};
api.state.plugins = [];
const projectId = api.state.project.id;
const pluginListPath = `/projects/${projectId}/plugins`;
const pluginPath = `${pluginListPath}/${plugin.id}`;
const base = process.env.MMT_WEB_URL ?? 'http://127.0.0.1:6082';
const screenshots = process.env.MMT_SCREENSHOT_DIR;
const imported = [];
const calls = [];
const pageErrors = [];
let pluginListGate;
let searchGate;
let releasePluginList;
let releaseSearch;
let closing = false;

function createDataset(revision) {
  return {
    externalId: `10000000-0000-4000-8000-${String(revision).padStart(12, '0')}`,
    namespace: 'review', name: `dataset-${revision}`, version: 'v1',
    uri: `file:///review/${revision}`, digest: `digest-${revision}`, schema: {}, metadata: {},
  };
}
function manifest() {
  return { id: 'mado', name: 'Mado', version: 'builtin', protocolVersion: '1.0',
    capabilities: ['datasets:search', 'lineage:publish', ...(accessTokenGrant.scopes.includes('metrics:read') ? ['storage:metrics'] : [])] };
}
function availability() {
  const connections = api.state.plugins.filter(connection => connection.kind === 'mado');
  return connections.length ? connections.map(connection => ({ kind: 'mado', id: connection.id, enabled: connection.enabled,
    configured: connection.tokenConfigured, configRevision: connection.configRevision,
    webUrl: connection.config?.webUrl ?? null,
    canImport: api.state.project.role === 'admin' || api.state.user.isAdmin,
  })) : [{ kind: 'mado', id: null, enabled: false, configured: false,
    configRevision: 0, webUrl: null, canImport: false }];
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
  if (pathname === `${pluginListPath}/availability`) return reply({ items: availability() });
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
    assert.equal(Object.hasOwn(body.config ?? {}, 'namespaces'), false, 'Namespaces come from the access token');
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
  if (pathname === `${pluginPath}/datasets/search`) {
    assert.equal(body.expectedRevision, plugin.configRevision);
    const dataset = createDataset(plugin.configRevision);
    if (searchGate) await searchGate;
    return reply({ items: [dataset] });
  }
  if (pathname === `${pluginPath}/datasets/import`) {
    assert.deepEqual(Object.keys(body).sort(), ['expectedRevision', 'externalId']);
    assert.equal(body.expectedRevision, plugin.configRevision);
    imported.push(body.externalId);
    const dataset = createDataset(plugin.configRevision);
    const version = Object.assign(api.state.datasetVersions[0], dataset, {
      externalRef: { pluginId: plugin.id, externalId: dataset.externalId,
        namespace: dataset.namespace, name: dataset.name, version: dataset.version },
    });
    return reply(version);
  }
  return api.route(route);
});

const page = await context.newPage();
page.on('pageerror', error => pageErrors.push(error.message));
const dialog = () => page.getByRole('dialog').last();
const result = revision => page.getByText(`review/dataset-${revision}`, { exact: true });
const importButtons = () => page.getByRole('button', { name: 'インポート', exact: true });
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
async function searchConnection() {
  await page.getByLabel('データセットを検索', { exact: true }).fill(`query-${plugin.configRevision}`);
  await page.getByRole('button', { name: '検索', exact: true }).click();
  await result(plugin.configRevision).waitFor();
}
async function editConnection(field, value) {
  await page.getByRole('button', { name: 'Madoの接続設定', exact: true }).click();
  await dialog().getByLabel(field).fill(value);
  pluginListGate = new Promise(resolve => { releasePluginList = resolve; });
  await dialog().getByRole('button', { name: '保存', exact: true }).click();
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  assert.equal(await importButtons().count(), 0, 'Saved settings must discard earlier import actions before the GET finishes');
  assert.equal(await page.locator('.storage-metrics').count(), 0);
  assert.equal(await page.getByLabel('データセットを検索', { exact: true }).inputValue(), '');
  pluginListGate = undefined;
  releasePluginList();
  await page.getByRole('button', { name: '再読み込み', exact: true }).waitFor();
}

try {
  console.log('Built-in Mado: unconfigured card, disabled registration and explicit connection check');
  await page.goto(`${base}/projects/${projectId}/plugins`);
  await page.getByText('Mado連携は未設定・無効です。', { exact: false }).waitFor();
  assert.equal(calls.some(call => /\/(check|metrics|datasets\/search)$/.test(call.pathname)), false);
  await screenshot('mado-unconfigured-ja');
  await page.getByRole('button', { name: 'Madoの接続設定', exact: true }).click();
  assert.equal(await dialog().getByLabel('許可Namespace').count(), 0, 'Namespaces come from the access token, not from input');
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
  assert.equal(await page.getByLabel('データセットを検索', { exact: true }).count(), 0);
  assert.equal(await page.getByText('接続を確認すると表示します', { exact: true }).count(), 3,
    'Permissions, namespaces and expiration are unknown until the connection is checked');
  await checkConnection();
  await page.getByText('mado-model-tracking、review', { exact: true }).waitFor();
  await page.getByText('DataLineageの読み取り、DataLineageの送信、Capacityの読み取り', { exact: true }).waitFor();
  assert.equal(await page.locator('.storage-metrics').count(), 0, 'Disabled integration must not fetch metrics automatically');
  await screenshot('mado-checked-ja');
  await page.getByRole('button', { name: 'Madoの接続設定', exact: true }).click();
  assert.equal(await dialog().getByLabel('アクセストークン').inputValue(), '', 'Saved tokens must not be returned to the browser');
  await dialog().getByRole('button', { name: 'キャンセル', exact: true }).click();
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  const initialRevision = plugin.configRevision;
  await page.getByTestId('plugin-toggle').click();
  await page.getByLabel('データセットを検索', { exact: true }).waitFor();
  await checkConnection();
  await searchConnection();
  await page.locator('.storage-metrics').waitFor();
  const searchedCalls = calls.filter(call => call.pathname.endsWith('/datasets/search')).length;
  await switchLanguage('English');
  assert.equal(await page.getByLabel('Search datasets', { exact: true }).inputValue(), `query-${initialRevision}`);
  await result(initialRevision).waitFor();
  assert.equal(calls.filter(call => call.pathname.endsWith('/datasets/search')).length, searchedCalls);
  await screenshot('mado-configured-en');
  await switchLanguage('日本語');

  console.log('Built-in Mado: credential revision invalidation, fixed-version import and disable');
  await editConnection('アクセストークン', 'browser-replacement-fixture');
  assert.equal(await page.getByText('接続を確認すると表示します', { exact: true }).count(), 3,
    'A replaced token must be checked again before its namespaces are shown');
  const importedRevision = plugin.configRevision;
  await checkConnection();
  await searchConnection();
  await importButtons().click();
  await page.getByRole('status').filter({ hasText: `dataset-${importedRevision}` }).waitFor();
  assert.equal(imported.at(-1), createDataset(importedRevision).externalId);
  await page.getByTestId('plugin-toggle').click();
  await page.getByRole('button', { name: '連携を有効にする', exact: true }).waitFor();
  assert.equal(await page.getByRole('button', { name: '接続を確認', exact: true }).isDisabled(), false);
  assert.equal(await importButtons().count(), 0);
  await page.getByTestId('plugin-toggle').click();
  await page.getByLabel('データセットを検索', { exact: true }).waitFor();
  await checkConnection();
  await searchConnection();

  console.log('Built-in Mado: an external settings change discards a late search response');
  searchGate = new Promise(resolve => { releaseSearch = resolve; });
  const requested = page.waitForRequest(request => new URL(request.url()).pathname.endsWith('/datasets/search'));
  await page.getByRole('button', { name: '検索', exact: true }).click();
  await requested;
  plugin.configRevision++;
  plugin.manifest = null;
  await page.getByRole('button', { name: '再読み込み', exact: true }).click();
  await page.getByLabel('データセットを検索', { exact: true }).waitFor();
  await page.waitForFunction(() => document.querySelector('.plugin-search input')?.value === '');
  const responded = page.waitForResponse(response => new URL(response.url()).pathname.endsWith('/datasets/search'));
  searchGate = undefined;
  releaseSearch();
  await (await responded).finished();
  assert.equal(await importButtons().count(), 0);
  assert.equal(await result(importedRevision).count(), 0);
  await checkConnection();
  await searchConnection();

  console.log('Built-in Mado: viewer navigation checks connection identity and disabled availability');
  api.state.user.isAdmin = false;
  api.state.project.role = 'viewer';
  await page.goto(`${base}/projects/${projectId}/datasets?version=${api.state.datasetVersions[0].id}`);
  const viewLink = page.getByRole('link', { name: 'Madoで見る', exact: true });
  await viewLink.waitFor();
  const destination = new URL(await viewLink.getAttribute('href'));
  assert.equal(destination.origin, 'https://mado-web.invalid');
  assert.equal(destination.pathname, '/lineage');
  assert.equal(destination.searchParams.get('versionId'), createDataset(importedRevision).externalId);
  assert.equal(destination.searchParams.get('node'), createDataset(importedRevision).externalId);
  assert.equal(await page.getByRole('link', { name: 'Madoからインポート', exact: true }).count(), 0);
  await screenshot('mado-viewer-version-ja');
  plugin.enabled = false;
  await page.reload();
  await page.getByRole('heading', { name: 'Datasets', exact: true }).waitFor();
  assert.equal(await viewLink.count(), 0);

  console.log('Built-in Mado: migration remains paused until explicitly completed and mobile fits');
  api.state.user.isAdmin = true;
  api.state.project.role = 'admin';
  plugin.enabled = true;
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
  releaseSearch?.();
  await browser.close();
}
