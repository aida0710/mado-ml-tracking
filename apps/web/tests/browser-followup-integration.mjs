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
  // 新しいユーザーにはProjectが無く、空のナビゲーションにはまだ見える枠が無い。
  await page.getByRole('button', { name: 'ユーザーメニュー', exact: true }).waitFor();
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
      .fill('Pluginsの全体管理者の制限を確認するローカル検証記録');
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
  const dataCatalogPluginPath = '/admin/plugins/data-catalog';
  // 相手に届かないURL。接続を確かめられないので、保存されない。
  const unreachableConnection = { url: 'http://127.0.0.1:9', accessToken: 'web-followup-fixture' };
  await projectAdminPage.goto(base + '/settings/plugins');
  await projectAdminPage.waitForURL(base + '/settings/account');
  await projectAdminPage
    .getByText('開こうとした画面は全体管理者だけが使えます。', { exact: false })
    .waitFor();
  const forbidden = await projectAdminPage.request.put(base + '/api' + dataCatalogPluginPath, {
    data: unreachableConnection,
  });
  assert.equal(forbidden.status(), 403, 'Project admin must not register server secrets');
  assert.equal((await projectAdminPage.request.get(base + '/api' + dataCatalogPluginPath)).status(), 403);

  console.log('Real API: a connection that cannot be checked is not saved');
  await adminPage.goto(base + '/settings/plugins');
  await adminPage.getByRole('heading', { name: 'Plugins', exact: true, level: 1 }).waitFor();
  const before = await getJson(adminPage, dataCatalogPluginPath);
  const unreachable = await adminPage.request.put(base + '/api' + dataCatalogPluginPath, {
    data: unreachableConnection,
  });
  assert.equal(unreachable.status(), 502);
  assert.equal((await unreachable.json()).code, 'data_catalog_request_failed');
  assert.deepEqual(await getJson(adminPage, dataCatalogPluginPath), before);
  await takeScreenshot(adminPage, 'plugins-real-global-admin');
  assert.deepEqual(errors, []);
  console.log(
    JSON.stringify({
      result: 'passed',
      projectId: project.id,
      projectAdminConnectStatus: forbidden.status(),
      unreachableConnectStatus: unreachable.status(),
      realDataCatalog: 'not connected; error path only',
    }),
  );
} finally {
  await browser.close();
}
