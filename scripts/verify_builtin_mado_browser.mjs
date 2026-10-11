import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

// The disposable server writes fixture credentials to a private file, never to logs.
const settings = JSON.parse(await readFile('var/builtin-mado-verification.json', 'utf8'));
const base = process.env.MMT_WEB_URL ?? 'http://127.0.0.1:6084';
assert.equal(new URL(base).hostname, '127.0.0.1');
const verificationDate = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Tokyo',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
}).format(new Date());
const artifacts = process.env.MMT_SCREENSHOT_DIR ?? `artifacts/builtin-mado/${verificationDate}`;
// Bound the verification of the asynchronous worker, with a short state polling interval.
const DELIVERY_WAIT_MS = 15000;
const DELIVERY_POLL_MS = 100;
await mkdir(artifacts, { recursive: true });
const { chromium } = await import(pathToFileURL(process.env.MMT_PLAYWRIGHT_MODULE).href);
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.MMT_CHROMIUM_PATH,
  args: ['--no-sandbox'],
});
const context = await browser.newContext({
  locale: 'ja-JP',
  viewport: { width: 1440, height: 960 },
  extraHTTPHeaders: { Origin: base },
});
const page = await context.newPage();
const pageErrors = [];
page.on('pageerror', (error) => pageErrors.push(error.message));
const projectPath = `/projects/${settings.projectId}`;

async function api(endpoint, { method = 'GET', body, status = 200 } = {}) {
  const response = await page.request.fetch(`${base}/api${endpoint}`, { method, data: body });
  assert.equal(response.status(), status, `${method} ${endpoint}: unexpected HTTP status`);
  return response.json();
}
async function capture(name) {
  assert.equal(
    await page.locator('input[type=password]').count(),
    0,
    'Never photograph credential inputs',
  );
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: path.join(artifacts, `${name}.png`), fullPage: true });
}
async function checkConnection() {
  await page.getByRole('button', { name: '接続を確認', exact: true }).click();
  await page.getByRole('status').filter({ hasText: '接続を確認しました' }).waitFor();
}
async function switchLanguage(name) {
  await page.getByRole('button', { name: /^(Language|表示言語):/ }).click();
  await page.getByRole('menuitemradio', { name, exact: true }).click();
}
try {
  await page.goto(base);
  await page.getByLabel('メールアドレス').fill('admin@localhost');
  await page.getByLabel('表示名').fill('開発管理者');
  await page.getByRole('button', { name: '開発モードでログイン' }).click();
  await page.getByRole('button', { name: 'ログアウト', exact: true }).waitFor();
  await page.goto(`${base}${projectPath}/plugins`);
  await page.getByText('Mado連携は未設定・無効です。', { exact: false }).waitFor();
  assert.deepEqual((await api(`${projectPath}/plugins`)).items, []);
  await capture('real-mado-unconfigured-ja');

  await page.getByRole('button', { name: 'Madoの接続設定', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Mado API URL').fill(settings.madoUrl);
  await dialog.getByLabel('Mado Web URL').fill(settings.madoUrl);
  await dialog.getByLabel('許可Namespace').fill('speech');
  await dialog
    .getByLabel('参照用キー（lineage:read）', { exact: true })
    .fill(settings.credentials.readToken);
  await dialog
    .getByLabel('送信用キー（lineage:write）', { exact: true })
    .fill(settings.credentials.lineageToken);
  await dialog
    .getByLabel('容量取得用キー（metrics:read、任意）', { exact: true })
    .fill(settings.credentials.metricsToken);
  await dialog.getByRole('button', { name: '保存', exact: true }).click();
  await dialog.waitFor({ state: 'hidden' });
  const connection = (await api(`${projectPath}/plugins`)).items[0];
  assert.equal(connection.kind, 'mado');
  assert.equal(connection.enabled, false);
  for (const token of Object.values(settings.credentials))
    assert(!JSON.stringify(connection).includes(token));
  await checkConnection();
  assert.equal((await api(`${projectPath}/plugins/${connection.id}/outbox`)).pending, 0);
  await page.getByRole('button', { name: '連携を有効にする', exact: true }).click();
  await page.getByRole('button', { name: '連携を無効にする', exact: true }).waitFor();
  await checkConnection();
  await page.getByLabel('データセットを検索', { exact: true }).fill('corpus');
  await page.getByRole('button', { name: '検索', exact: true }).click();
  await page.getByText('speech/fixture-corpus', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'インポート', exact: true }).click();
  await page.getByRole('status').filter({ hasText: 'fixture-corpus / v1' }).waitFor();
  await capture('real-mado-enabled-ja');
  const dataset = (await api(`${projectPath}/datasets`)).items.find(
    (item) => item.name === 'fixture-corpus',
  );
  assert(dataset);
  const version = (await api(`${projectPath}/datasets/${dataset.id}/versions`)).items[0];
  assert.equal(version.externalRef.pluginId, connection.id);
  assert.equal(version.externalRef.externalId, settings.madoVersionId);
  assert.equal(version.uri, 's3://fixtures/corpus/v1');
  await page.goto(`${base}${projectPath}/datasets?version=${version.id}`);
  const madoLink = page.getByRole('link', { name: 'Madoで見る', exact: true });
  await madoLink.waitFor();
  const destination = new URL(await madoLink.getAttribute('href'));
  assert.equal(destination.origin, settings.madoUrl);
  assert.equal(destination.pathname, '/lineage');
  assert.equal(destination.searchParams.get('versionId'), settings.madoVersionId);
  assert.equal(destination.searchParams.get('node'), settings.madoVersionId);
  await capture('real-mado-dataset-ja');

  const run = await api(`${projectPath}/runs`, {
    method: 'POST',
    status: 201,
    body: {
      experimentId: settings.experimentId,
      name: 'Mado送信を確認',
      kind: 'processing',
      inputDatasetVersionIds: [version.id],
    },
  });
  for (const status of ['running', 'finished'])
    await api(`${projectPath}/runs/${run.id}`, { method: 'PATCH', body: { status } });
  await page.goto(`${base}${projectPath}/plugins?id=${connection.id}`);
  // The domain worker's delivery state is the condition; no fixed delay hides a race.
  const deliveryDeadline = Date.now() + DELIVERY_WAIT_MS;
  let outbox;
  do {
    outbox = await api(`${projectPath}/plugins/${connection.id}/outbox`);
    if (outbox.pending === 0 && outbox.sending === 0 && outbox.lastDeliveredAt) break;
    await new Promise((resolve) => setTimeout(resolve, DELIVERY_POLL_MS));
  } while (Date.now() < deliveryDeadline);
  assert.equal(outbox.pending, 0);
  assert.equal(outbox.sending, 0);
  assert(outbox.lastDeliveredAt);

  await page.getByRole('button', { name: '連携を無効にする', exact: true }).click();
  await page.getByRole('button', { name: '連携を有効にする', exact: true }).waitFor();
  await page.goto(`${base}${projectPath}/datasets?version=${version.id}`);
  await page.getByRole('heading', { name: 'Datasets', exact: true }).waitFor();
  assert.equal(await page.getByRole('link', { name: 'Madoで見る', exact: true }).count(), 0);
  assert.equal(
    await page.getByRole('link', { name: 'Madoからインポート', exact: true }).count(),
    0,
  );
  await page.goto(`${base}${projectPath}/plugins?id=${connection.id}`);
  await page.getByRole('button', { name: '連携を有効にする', exact: true }).click();
  await page.getByRole('button', { name: '連携を無効にする', exact: true }).waitFor();
  await switchLanguage('English');
  await page.getByRole('heading', { name: 'Integrations', exact: true }).waitFor();
  await capture('real-mado-configured-en');
  await switchLanguage('日本語');
  await page.setViewportSize({ width: 320, height: 850 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await capture('real-mado-mobile-ja');
  assert.deepEqual(pageErrors, []);
  const summary = {
    result: 'passed',
    projectId: settings.projectId,
    pluginId: connection.id,
    checks: [
      'initially disabled with no connection row',
      'encrypted credential save and read-only check',
      'explicit enable, catalog search, immutable version import',
      'Mado version link from actual connection',
      'real outbox delivery of START/COMPLETE',
      'disable hides Dataset actions',
      'Japanese, English and 320px layout',
    ],
    registry: 'Mado HTTP routes with isolated Registry fixture; external Registry DB not contacted',
  };
  await writeFile(
    path.join(artifacts, 'real-browser-result.json'),
    JSON.stringify(summary, null, 2),
  );
  console.log(JSON.stringify(summary, null, 2));
} finally {
  await browser.close();
}
