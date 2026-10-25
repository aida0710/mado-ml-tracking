import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { createBrowserApi } from './browserApi.mjs';
import { switchProject } from './projectSwitcher.mjs';

const modulePath = process.env.MMT_PLAYWRIGHT_MODULE;
if (!modulePath) throw new Error('Set MMT_PLAYWRIGHT_MODULE to an installed Playwright index.mjs');
const { chromium } = await import(pathToFileURL(modulePath).href);
const browser = await chromium.launch({
  headless: true,
  args: ['--no-sandbox'],
  ...(process.env.MMT_CHROMIUM_PATH ? { executablePath: process.env.MMT_CHROMIUM_PATH } : {}),
});
const context = await browser.newContext({
  locale: 'ja-JP',
  viewport: { width: 1440, height: 960 },
});
const api = createBrowserApi();
api.state.loggedIn = true;
const projectA = { ...api.state.project, name: 'Revision review A' };
const projectB = {
  ...projectA, id: '40000000-0000-4000-8000-000000000001', name: 'Revision review B',
};
const first = { ...structuredClone(api.state.plugins[0]), name: 'Mado A' };
const second = {
  ...structuredClone(first), id: '40000000-0000-4000-8000-000000000002', name: 'Mado B',
};
api.state.plugins = [first, second];
const listPath = `/projects/${projectA.id}/plugins`;
const firstPath = `${listPath}/${first.id}`;
const base = process.env.MMT_WEB_URL ?? 'http://127.0.0.1:6082';
const pageErrors = [];
let listGate;
let releaseList;
let saveGate;
let releaseSave;
let closing = false;

await context.route(url => url.pathname.startsWith('/api/'), async route => {
  const request = route.request();
  const path = new URL(request.url()).pathname.replace(/^\/api/, '');
  const body = request.headers()['content-type']?.includes('application/json')
    ? request.postDataJSON() : {};
  const reply = payload => route
    .fulfill({ contentType: 'application/json', body: JSON.stringify(payload) })
    .catch(error => { if (!closing) throw error; });
  if (path === '/projects') return reply({ items: [projectA, projectB] });
  if (path === `/projects/${projectB.id}`) return reply(projectB);
  if (path === `/projects/${projectB.id}/plugins`) return reply({ items: [] });
  if (path === `/projects/${projectB.id}/plugins/availability`) return reply({
    items: [{
      kind: 'mado', id: null, enabled: false, configured: false,
      configRevision: 0, webUrl: null, canImport: false,
    }],
  });
  if (path.startsWith(`/projects/${projectB.id}/`)) return reply({ items: [] });
  if (path === listPath && request.method() === 'GET') {
    if (listGate) await listGate;
    return reply({ items: api.state.plugins });
  }
  const plugin = api.state.plugins.find(connection => path === `${listPath}/${connection.id}`);
  if (plugin && request.method() === 'PATCH') {
    if (body.expectedRevision !== undefined)
      assert.equal(body.expectedRevision, plugin.configRevision);
    for (const name of ['name', 'config', 'enabled']) {
      if (Object.hasOwn(body, name)) plugin[name] = body[name];
    }
    plugin.configRevision++;
    const saved = structuredClone(plugin);
    if (saveGate) await saveGate;
    return reply(saved);
  }
  return api.route(route);
});

const page = await context.newPage();
page.on('pageerror', error => pageErrors.push(error.message));
const toggle = () => page.getByTestId('plugin-toggle');
const waitForList = () => page.waitForResponse(response =>
  new URL(response.url()).pathname === `/api${listPath}` && response.request().method() === 'GET',
);
async function releaseListResponse() {
  const response = waitForList();
  listGate = undefined;
  releaseList();
  await (await response).finished();
}
async function openProjectPlugins(project) {
  await switchProject(page, project.name);
  await page.waitForURL(`${base}/projects/${project.id}/experiments`);
  await page.getByRole('link', { name: '連携', exact: true })
    .and(page.locator(`[href="/projects/${project.id}/plugins"]`)).click();
  await page.waitForURL(url => url.pathname === `/projects/${project.id}/plugins`);
  await page.getByRole('heading', { name: '連携', exact: true }).waitFor();
}

try {
  console.log('Plugin revisions: saving A and B before a delayed GET retains both responses');
  await page.goto(`${base}${listPath}`);
  await page.getByRole('heading', { name: first.name, exact: true }).waitFor();
  listGate = new Promise(resolve => { releaseList = resolve; });
  await toggle().click();
  await page.getByRole('button', { name: '連携を有効にする', exact: true }).waitFor();
  await page.getByRole('button', { name: second.name, exact: true }).click();
  await toggle().click();
  await page.getByRole('button', { name: '連携を有効にする', exact: true }).waitFor();
  await page.getByRole('button', { name: first.name, exact: true }).click();
  await page.getByRole('heading', { name: first.name, exact: true }).waitFor();
  assert.equal(first.enabled, false);
  assert.equal(second.enabled, false);
  assert.equal(
    (await toggle().textContent()).trim(), '連携を有効にする',
    'Saving B reverted the earlier saved disabled state of A before the GET finished',
  );
  await releaseListResponse();

  console.log('Plugin revisions: a newer GET takes precedence over an earlier saved response');
  listGate = new Promise(resolve => { releaseList = resolve; });
  await toggle().click();
  await page.getByRole('button', { name: '連携を無効にする', exact: true }).waitFor();
  first.configRevision++;
  first.enabled = false;
  first.name = 'Mado A newer';
  await releaseListResponse();
  await page.getByRole('heading', { name: first.name, exact: true }).waitFor();
  assert.equal((await toggle().textContent()).trim(), '連携を有効にする');

  console.log('Plugin revisions: a save response after leaving its Project must not navigate back');
  await openProjectPlugins(projectB);
  await page.getByText('Mado連携は未設定・無効です。', { exact: false }).waitFor();
  await openProjectPlugins(projectA);
  await page.getByRole('button', { name: 'Madoの接続設定', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('名前').fill('A response after switch');
  saveGate = new Promise(resolve => { releaseSave = resolve; });
  const submitted = page.waitForRequest(request =>
    new URL(request.url()).pathname === `/api${firstPath}`,
  );
  await dialog.getByRole('button', { name: '保存', exact: true }).click();
  await submitted;
  await page.goBack();
  await page.waitForURL(`${base}/projects/${projectA.id}/experiments`);
  await page.goBack();
  await page.waitForURL(`${base}/projects/${projectB.id}/plugins`);
  await page.getByText('Mado連携は未設定・無効です。', { exact: false }).waitFor();
  const currentUrl = page.url();
  const completed = page.waitForResponse(response =>
    new URL(response.url()).pathname === `/api${firstPath}`,
  );
  saveGate = undefined;
  releaseSave();
  await (await completed).finished();
  // 応答の本文を読み終えたあと、時間で待たずにReactへ次の描画の機会を与える。
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(resolve)));
  assert.equal(page.url(), currentUrl, 'The earlier Project save changed the current navigation');
  assert.equal(
    await page.getByRole('heading', { name: 'A response after switch', exact: true }).count(), 0,
  );
  assert.deepEqual(pageErrors, []);
  console.log('Plugin revision browser checks passed.');
} finally {
  closing = true;
  releaseList?.();
  releaseSave?.();
  await browser.close();
}
