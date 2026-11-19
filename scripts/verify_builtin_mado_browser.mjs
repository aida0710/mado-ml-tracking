import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

// 使い捨てのサーバーは、fixtureの認証情報を非公開のファイルに書き、ログには決して書かない。
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
  // ログインの画面は同じURLのまま出るので、URLではなくログインの応答を待つ。
  const signedIn = page.waitForResponse(
    (response) => new URL(response.url()).pathname === '/api/auth/dev-login',
  );
  await page.getByRole('button', { name: '開発モードでログイン' }).click();
  assert.equal((await signedIn).status(), 200);
  await page.goto(`${base}${projectPath}/plugins`);
  await page.getByText('Mado連携は未設定・無効です。', { exact: false }).waitFor();
  assert.deepEqual((await api(`${projectPath}/plugins`)).items, []);
  await capture('real-mado-unconfigured-ja');

  await page.getByRole('button', { name: 'Madoの接続設定', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Mado API URL').fill(settings.madoUrl);
  await dialog.getByLabel('Mado Web URL').fill(settings.madoUrl);
  await dialog
    .getByLabel('アクセストークン', { exact: true })
    .fill(settings.credentials.accessToken);
  await dialog.getByRole('button', { name: '保存', exact: true }).click();
  await dialog.waitFor({ state: 'hidden' });
  const connection = (await api(`${projectPath}/plugins`)).items[0];
  assert.equal(connection.kind, 'mado');
  assert.equal(connection.enabled, false);
  for (const token of Object.values(settings.credentials))
    assert(!JSON.stringify(connection).includes(token));
  await checkConnection();
  // ここに出る許可は、access tokenに対するmado S3 Data Catalogの応答から来る。
  await page.getByText('Capacityの読み取り', { exact: true }).waitFor();
  const storageMetrics = page.getByRole('region', { name: 'Storage metrics', exact: true });
  assert.equal(await storageMetrics.count(), 0, 'A disabled connection must not read capacity');
  await capture('real-mado-checked-ja');
  await page.getByRole('button', { name: '連携を有効にする', exact: true }).click();
  await page.getByRole('button', { name: '連携を無効にする', exact: true }).waitFor();
  await checkConnection();
  // fixtureのバケットは1048576バイト。formatBytesは小数1桁で表す。
  await storageMetrics.getByText('1.0 MiB', { exact: true }).waitFor();
  await capture('real-mado-enabled-ja');
  const metrics = await api(`${projectPath}/plugins/${connection.id}/metrics`);
  assert(metrics.prometheus.includes('mado_storage_bucket_bytes'));

  await page.getByRole('button', { name: '連携を無効にする', exact: true }).click();
  await page.getByRole('button', { name: '連携を有効にする', exact: true }).waitFor();
  assert.equal(await storageMetrics.count(), 0);
  await api(`${projectPath}/plugins/${connection.id}/metrics`, { status: 422 });
  await page.getByRole('button', { name: '連携を有効にする', exact: true }).click();
  await page.getByRole('button', { name: '連携を無効にする', exact: true }).waitFor();
  await switchLanguage('English');
  await page.getByRole('heading', { name: 'Integrations', exact: true }).waitFor();
  await capture('real-mado-configured-en');
  await switchLanguage('日本語');
  await page.setViewportSize({ width: 320, height: 850 });
  // レスポンシブな部品はリサイズのあとに描き直される。固定の待ち時間でなく、その配置を待つ。
  await page.waitForFunction(() => document.documentElement.scrollWidth <= innerWidth);
  await capture('real-mado-mobile-ja');
  assert.deepEqual(pageErrors, []);
  const summary = {
    result: 'passed',
    projectId: settings.projectId,
    pluginId: connection.id,
    checks: [
      'initially disabled with no connection row',
      'encrypted credential save and read-only check',
      'explicit enable, then capacity read through the real Mado metrics route',
      'disable stops reading capacity',
      'Japanese, English and 320px layout',
    ],
    mado: 'Mado HTTP routes with fixture authentication and capacity; production was not contacted',
  };
  await writeFile(
    path.join(artifacts, 'real-browser-result.json'),
    JSON.stringify(summary, null, 2),
  );
  console.log(JSON.stringify(summary, null, 2));
} finally {
  await browser.close();
}
