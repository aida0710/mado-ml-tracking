import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { openProjectCreation } from './projectCreation.mjs';

const { chromium } = await import(pathToFileURL(process.env.MMT_PLAYWRIGHT_MODULE).href);
const base = process.env.MMT_WEB_URL ?? 'http://127.0.0.1:5182';
assert.equal(new URL(base).hostname, '127.0.0.1', 'Use only the local development API');
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.MMT_CHROMIUM_PATH,
  args: ['--no-sandbox'],
});
const errors = [];
const screenshotDirectory = process.env.MMT_SCREENSHOT_DIR;

async function login(context, email) {
  const page = await context.newPage();
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(base);
  await page.getByLabel('メールアドレス').fill(email);
  await page.getByLabel('表示名').fill('Web追加検証担当');
  await page.getByRole('button', { name: '開発モードでログイン' }).click();
  // A new user has no projects and the empty navigation has no visible box yet.
  await page.getByRole('button', { name: 'ログアウト', exact: true }).waitFor();
  return page;
}

async function getJson(page, path) {
  const response = await page.request.get(`${base}/api${path}`);
  assert.equal(response.ok(), true, `${path}: HTTP ${response.status()}`);
  return response.json();
}

async function takeScreenshot(page, name) {
  if (!screenshotDirectory) return;
  await mkdir(screenshotDirectory, { recursive: true });
  await page.screenshot({ path: `${screenshotDirectory}/${name}.png`, fullPage: true });
}

try {
  const adminContext = await browser.newContext({
    locale: 'ja-JP',
    viewport: { width: 1440, height: 960 },
    extraHTTPHeaders: { Origin: base },
  });
  const adminPage = await login(adminContext, 'admin@localhost');
  console.log('Real API: compact default Runs columns');
  assert.equal((await getJson(adminPage, '/auth/me')).user.isAdmin, true);
  const demo = (await getJson(adminPage, '/projects')).items.find(
    (project) => project.name === 'mado ML Tracking Demo',
  );
  if (demo) {
    await adminPage.goto(`${base}/projects/${demo.id}/experiments`);
    await adminPage.getByRole('link', { name: 'CPU linear regression', exact: true }).waitFor();
    const table = adminPage.locator('.runs-page table');
    assert.equal(await table.locator('th').filter({ hasText: 'Metrics' }).count(), 2);
    assert.equal(await table.locator('th').filter({ hasText: 'パラメータ' }).count(), 2);
    const metricBounds = await table
      .locator('th')
      .filter({ hasText: 'Metrics' })
      .nth(1)
      .boundingBox();
    assert.ok(metricBounds.x + metricBounds.width < 1440, 'real metrics are off screen');
    await takeScreenshot(adminPage, 'runs-real-light');
  }

  const projectAdminContext = await browser.newContext({
    locale: 'ja-JP',
    viewport: { width: 1440, height: 960 },
    extraHTTPHeaders: { Origin: base },
  });
  const projectAdminPage = await login(
    projectAdminContext,
    'web-plugin-project-admin@example.invalid',
  );
  console.log('Real API: project admin registration is forbidden');
  assert.equal((await getJson(projectAdminPage, '/auth/me')).user.isAdmin, false);
  const projectName = 'Web followup permissions';
  let project = (await getJson(projectAdminPage, '/projects')).items.find(
    (project) => project.name === projectName,
  );
  if (!project) {
    await openProjectCreation(projectAdminPage, {
      base,
      projects: (await getJson(projectAdminPage, '/projects')).items,
    });
    await projectAdminPage.getByRole('dialog').getByLabel('名前').fill(projectName);
    await projectAdminPage
      .getByRole('dialog')
      .getByLabel('説明')
      .fill('Plugin登録のglobal admin制限を確認するローカル検証記録');
    await projectAdminPage
      .getByRole('dialog')
      .getByRole('button', { name: '作成', exact: true })
      .click();
    await projectAdminPage.getByRole('dialog').waitFor({ state: 'hidden' });
    project = (await getJson(projectAdminPage, '/projects')).items.find(
      (project) => project.name === projectName,
    );
  }
  assert.equal(project.role, 'admin');
  const pluginPath = `/projects/${project.id}/plugins`;
  await projectAdminPage.goto(base + pluginPath);
  await projectAdminPage.getByRole('heading', { name: '連携', exact: true }).waitFor();
  assert.equal(
    await projectAdminPage.getByRole('button', { name: 'Madoの接続設定', exact: true }).count(),
    0,
  );
  assert.equal(await projectAdminPage.getByRole('dialog').count(), 0);
  const pluginsBefore = (await getJson(projectAdminPage, pluginPath)).items;
  const forbidden = await projectAdminPage.request.post(base + '/api' + pluginPath, {
    data: {
      kind: 'mado',
      name: 'Web forbidden Mado connection',
      config: {
        apiUrl: 'http://127.0.0.1:9',
        webUrl: 'http://127.0.0.1:9',
        lineageUrl: 'http://127.0.0.1:9',
        namespaces: ['verification'],
        jobNamespace: 'mado-model-tracking',
        storageSystemKey: 'mado-model-tracking',
      },
      enabled: false,
    },
  });
  assert.equal(forbidden.status(), 403, 'Project admin must not register server secrets');
  assert.equal((await getJson(projectAdminPage, pluginPath)).items.length, pluginsBefore.length);

  console.log('Real API: global admin saves a disabled Mado connection without credentials');
  await adminPage.goto(base + pluginPath);
  const pluginName = 'Web followup Mado (unconfigured)';
  let plugin = (await getJson(adminPage, pluginPath)).items.find(
    (item) => item.name === pluginName,
  );
  if (!plugin) {
    await adminPage.getByRole('button', { name: 'Madoの接続設定', exact: true }).click();
    const dialog = adminPage.getByRole('dialog');
    await dialog.getByLabel('名前').fill(pluginName);
    await dialog.getByLabel('Mado API URL').fill('http://127.0.0.1:9');
    await dialog.getByLabel('Mado Web URL').fill('http://127.0.0.1:9');
    await dialog.getByLabel('許可Namespace').fill('verification');
    await dialog.getByRole('button', { name: '保存', exact: true }).click();
    await dialog.waitFor({ state: 'hidden' });
    plugin = (await getJson(adminPage, pluginPath)).items.find((item) => item.name === pluginName);
  }
  assert.ok(plugin);
  assert.equal(plugin.enabled, false);
  await projectAdminPage.goto(base + pluginPath + '?id=' + plugin.id);
  console.log('Real API: project admin sees missing credentials and cannot start a request');
  const check = projectAdminPage.getByRole('button', { name: '接続を確認', exact: true });
  await check.waitFor();
  assert.equal(await check.isDisabled(), true);
  await projectAdminPage
    .getByText('Madoの参照用・送信用キーを設定してください。', { exact: false })
    .waitFor();
  assert.equal(
    await projectAdminPage.getByRole('button', { name: 'Madoの接続設定', exact: true }).count(),
    0,
  );
  assert.equal(await projectAdminPage.getByLabel('データセットを検索').count(), 0);
  const checkResponse = await projectAdminPage.request.post(
    base + '/api' + pluginPath + '/' + plugin.id + '/check',
  );
  assert.equal(checkResponse.status(), 503);
  assert.equal((await checkResponse.json()).code, 'plugin_token_unavailable');
  const searchResponse = await projectAdminPage.request.post(
    base + '/api' + pluginPath + '/' + plugin.id + '/datasets/search',
    {
      data: { query: 'verification', expectedRevision: plugin.configRevision },
    },
  );
  assert.equal(searchResponse.status(), 422);
  assert.equal((await searchResponse.json()).code, 'plugin_disabled');
  const retryResponse = await projectAdminPage.request.post(
    base + '/api' + pluginPath + '/' + plugin.id + '/events/retry',
  );
  assert.equal(retryResponse.status(), 422);
  assert.equal((await retryResponse.json()).code, 'plugin_disabled');
  assert.equal(
    await projectAdminPage.getByRole('heading', { name: 'Storage metrics', exact: true }).count(),
    0,
  );
  await takeScreenshot(projectAdminPage, 'plugins-real-project-admin');
  assert.deepEqual(errors, []);
  console.log(
    JSON.stringify({
      result: 'passed',
      projectId: project.id,
      pluginId: plugin.id,
      projectAdminRegistrationStatus: forbidden.status(),
      unconfiguredCheckStatus: checkResponse.status(),
      disabledSearchStatus: searchResponse.status(),
      disabledRetryStatus: retryResponse.status(),
      realCollector: 'not connected; error path only',
    }),
  );
} finally {
  await browser.close();
}
