import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

// 使い捨てのサーバーは、fixtureの認証情報を非公開のファイルに書き、ログには決して書かない。
const settings = JSON.parse(await readFile('var/data-catalog-verification.json', 'utf8'));
const base = process.env.MMT_WEB_URL ?? 'http://127.0.0.1:6084';
assert.equal(new URL(base).hostname, '127.0.0.1');
const verificationDate = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Tokyo',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
}).format(new Date());
const artifacts = process.env.MMT_SCREENSHOT_DIR ?? `artifacts/data-catalog/${verificationDate}`;
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
const DATA_CATALOG_PLUGIN_ENDPOINT = '/admin/plugins/data-catalog';

async function api(endpoint, { method = 'GET', body, status = 200 } = {}) {
  const response = await page.request.fetch(`${base}/api${endpoint}`, { method, data: body });
  assert.equal(response.status(), status, `${method} ${endpoint}: unexpected HTTP status`);
  return status === 204 ? undefined : response.json();
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

  // Projectの画面のサイドバーの下端から全体設定へ入り、Pluginsを開く。
  await page.goto(`${base}/projects/${settings.projectId}/experiments`);
  await page.locator('.navigation-sidebar').getByRole('link', { name: '全体設定', exact: true }).click();
  await page.getByRole('link', { name: 'Plugins', exact: true }).click();
  await page.getByRole('heading', { name: 'Plugins', exact: true, level: 1 }).waitFor();
  const dataCatalogSection = page.getByRole('region', { name: 'mado S3 Data Catalog', exact: true });
  await dataCatalogSection.getByText('未接続', { exact: true }).waitFor();
  assert.equal((await api(DATA_CATALOG_PLUGIN_ENDPOINT)).connection, null);
  await capture('real-unconnected-ja');

  await page.getByRole('button', { name: 'mado S3 Data Catalogに接続', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('URL').fill(settings.dataCatalogUrl);
  await dialog.getByLabel('アクセストークン').fill(settings.accessToken);
  await dialog.getByRole('button', { name: '接続', exact: true }).click();
  await dialog.waitFor({ state: 'hidden' });
  await dataCatalogSection.getByText('接続済み', { exact: true }).waitFor();
  const plugin = await api(DATA_CATALOG_PLUGIN_ENDPOINT);
  assert.equal(plugin.connection.url, settings.dataCatalogUrl);
  assert(!JSON.stringify(plugin).includes(settings.accessToken));
  // ここに出る許可は、access tokenに対するmado S3 Data Catalogの応答から来る。
  await page.getByText('Capacityの読み取り', { exact: true }).waitFor();
  // 接続した時点で容量が出る。fixtureのバケットは1048576バイトで、formatBytesは小数1桁で表す。
  const capacity = page.getByRole('region', { name: 'ストレージの容量', exact: true });
  await capacity.getByText('1.0 MiB', { exact: true }).waitFor();
  await capture('real-connected-ja');
  assert(
    (await api(`${DATA_CATALOG_PLUGIN_ENDPOINT}/capacity`)).prometheus.includes(
      'mado_storage_bucket_bytes',
    ),
  );

  await page.getByRole('button', { name: '接続を確認', exact: true }).click();
  await page.getByRole('status').filter({ hasText: '接続を確認しました' }).waitFor();
  await capacity.getByText('1.0 MiB', { exact: true }).waitFor();

  await switchLanguage('English');
  await page.getByRole('region', { name: 'Storage capacity', exact: true }).waitFor();
  await capture('real-connected-en');
  await switchLanguage('日本語');
  await page.setViewportSize({ width: 320, height: 850 });
  // レスポンシブな部品はリサイズのあとに描き直される。固定の待ち時間でなく、その配置を待つ。
  await page.waitForFunction(() => document.documentElement.scrollWidth <= innerWidth);
  await capture('real-mobile-ja');
  await page.setViewportSize({ width: 1440, height: 960 });

  // 本物のAPIの応答（バージョンのストレージ接続）を、画面の契約の検査を通して読む。
  await page.getByText('fixture storage (onprem)', { exact: true }).waitFor();
  const projectPath = `/projects/${settings.projectId}`;
  const { storageConnections } = await api(`${projectPath}/data-catalog`);
  assert.deepEqual(storageConnections.map((storageConnection) => storageConnection.name), [
    'fixture storage',
  ]);
  const storageConnectionId = storageConnections[0].id;
  const dataset = await api(`${projectPath}/datasets`, {
    method: 'POST',
    body: { name: 'corpus' },
    status: 201,
  });
  await page.goto(`${base}${projectPath}/datasets`);
  await page.getByRole('button', { name: 'バージョンを作成', exact: true }).click();
  await dialog.getByLabel('バージョン', { exact: false }).first().fill('v1');
  // mado S3 Data Catalogの「Web URLをコピー」の形を貼り、URIとストレージ接続に直す。
  await dialog
    .getByLabel('URI', { exact: false })
    .first()
    .fill(`${settings.dataCatalogUrl}/storage/${storageConnectionId}/corpus/ja/train/`);
  await dialog.getByRole('button', { name: 'S3のURIに直す', exact: true }).click();
  assert.equal(await dialog.getByLabel('ストレージ接続', { exact: false }).inputValue(), storageConnectionId);
  await dialog.getByLabel('Digest', { exact: false }).fill(`sha256:${'0'.repeat(64)}`);
  await capture('real-dataset-version-dialog-ja');
  await dialog.getByRole('button', { name: '保存', exact: true }).click();
  await dialog.waitFor({ state: 'hidden' });
  const expectedLink = `${settings.dataCatalogUrl}/storage/${storageConnectionId}/corpus/ja/train/`;
  const openInDataCatalog = page.getByRole('link', { name: 'mado S3 Data Catalogで開く', exact: true });
  await openInDataCatalog.first().waitFor();
  assert.equal(await openInDataCatalog.first().getAttribute('href'), expectedLink);
  await capture('real-dataset-storage-link-ja');
  const [datasetVersion] = (await api(`${projectPath}/datasets/${dataset.id}/versions`)).items;
  assert.equal(datasetVersion.dataCatalogStorageConnectionId, storageConnectionId);
  // ストレージ接続の無いs3://は、APIが断る。
  const refused = await page.request.fetch(`${base}/api${projectPath}/datasets/${dataset.id}/versions`, {
    method: 'POST',
    data: { version: 'v2', uri: 's3://corpus/ja/', digest: `sha256:${'0'.repeat(64)}` },
  });
  assert.equal(refused.status(), 422);
  assert.equal((await refused.json()).code, 'data_catalog_storage_connection_required');

  // モデルの重みのURIも同じ。登録はAPIで行い、画面が本物の応答を読めることを確かめる。
  const model = await api(`${projectPath}/models`, {
    method: 'POST',
    body: { name: 'speech', family: 'qwen2' },
    status: 201,
  });
  await api(`${projectPath}/models/${model.id}/versions`, {
    method: 'POST',
    body: {
      version: 'v1',
      weightsUri: 's3://models/v1.bin',
      dataCatalogStorageConnectionId: storageConnectionId,
    },
    status: 201,
  });
  await page.goto(`${base}${projectPath}/models`);
  await openInDataCatalog.first().waitFor();
  assert.equal(
    await openInDataCatalog.first().getAttribute('href'),
    `${settings.dataCatalogUrl}/storage/${storageConnectionId}/models/v1.bin`,
  );
  await capture('real-model-storage-link-ja');

  await page.goto(`${base}/settings/plugins`);
  await page.getByRole('button', { name: '接続を解除', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: '接続を解除', exact: true }).click();
  await dataCatalogSection.getByText('未接続', { exact: true }).waitFor();
  assert.equal((await api(DATA_CATALOG_PLUGIN_ENDPOINT)).connection, null);
  await api(`${DATA_CATALOG_PLUGIN_ENDPOINT}/capacity`, { status: 404 });
  assert.deepEqual(pageErrors, []);
  const summary = {
    result: 'passed',
    checks: [
      'the project sidebar leads to the global settings, where Plugins starts unconnected',
      'one URL and the access token connect, and capacity is read through the real metrics route at once',
      'the stored access token never returns to the browser',
      'checking again keeps the capacity',
      'Japanese, English and 320px layout',
      'a pasted mado S3 Data Catalog URL registers a dataset version with its storage connection, read back through the real API',
      'dataset and model versions link to their mado S3 Data Catalog page; s3:// without a storage connection is refused',
      'disconnecting removes the connection and stops capacity reads',
    ],
    dataCatalog:
      'mado S3 Data Catalog HTTP routes with fixture authentication and capacity; production was not contacted',
  };
  await writeFile(
    path.join(artifacts, 'real-browser-result.json'),
    JSON.stringify(summary, null, 2),
  );
  console.log(JSON.stringify(summary, null, 2));
} finally {
  await browser.close();
}
