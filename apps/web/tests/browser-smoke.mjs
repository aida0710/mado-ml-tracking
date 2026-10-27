import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { createBrowserApi } from './browserApi.mjs';
import { openProjectSwitcher } from './projectSwitcher.mjs';
import { closeUploadDialog, uploadOneFile } from './uploadDialog.mjs';
import { waitForNoHorizontalOverflow } from './viewportOverflow.mjs';

// 共有のworkspaceの依存関係を変えずに、インストール済みのPlaywrightを使い回す。
const modulePath = process.env.MMT_PLAYWRIGHT_MODULE;
if (!modulePath) throw new Error('Set MMT_PLAYWRIGHT_MODULE to an installed Playwright index.mjs');
const { chromium } = await import(pathToFileURL(modulePath).href);
const browser = await chromium.launch({
  headless: true,
  ...(process.env.MMT_CHROMIUM_PATH ? { executablePath: process.env.MMT_CHROMIUM_PATH } : {}),
  args: ['--no-sandbox'],
});
const context = await browser.newContext({ locale: 'ja-JP', viewport: { width: 1440, height: 960 } });
const api = createBrowserApi();
await context.route((url) => url.pathname.startsWith('/api/'), api.route);
const page = await context.newPage();
const pageErrors = [];
page.on('pageerror', (error) => pageErrors.push(error.message));
const base = process.env.MMT_WEB_URL ?? 'http://127.0.0.1:5182';
const projectBase = `${base}/projects/${api.state.project.id}`;
const artifactsDirectory = process.env.MMT_SCREENSHOT_DIR;
try {
  console.log('Browser check: authentication');
  await page.goto(base);
  await page.getByLabel('メールアドレス').fill('ui-test@example.invalid');
  await page.getByLabel('表示名').fill('UI検証担当');
  assert.equal(api.state.calls.filter((call) => call.path === '/auth/dev-login').length, 0);
  await page.getByRole('button', { name: '開発モードでログイン' }).click();
  await page.getByRole('heading', { name: 'すべての実験', exact: true }).waitFor();
  await page.getByRole('link', { name: 'training-test-01', exact: true }).waitFor();
  console.log('Browser check: compact default columns');
  const runTable = page.locator('.runs-page table');
  assert.equal(await runTable.locator('th').filter({ hasText: 'Metrics' }).count(), 2);
  assert.equal(await runTable.locator('th').filter({ hasText: 'パラメータ' }).count(), 2);
  const headerNames = await runTable.locator('th').allTextContents();
  assert.ok(
    headerNames.findIndex((name) => name.includes('Metrics')) <
      headerNames.findIndex((name) => name.includes('パラメータ')),
  );
  const metricBounds = await runTable
    .locator('th')
    .filter({ hasText: 'Metrics' })
    .nth(1)
    .boundingBox();
  assert.ok(metricBounds.x + metricBounds.width < 1440, 'default metrics are off screen');
  const preciseValue = runTable.locator('.compact-value[title="0.123456789123"]');
  assert.equal(await preciseValue.textContent(), '0.1235');
  await page.locator('.column-menu summary').click();
  await page.getByLabel('metrics.val/loss', { exact: true }).check();
  await page.getByLabel('params.spk_emb', { exact: true }).check();
  assert.equal(await runTable.locator('th').filter({ hasText: 'Metrics' }).count(), 3);
  assert.equal(await runTable.locator('th').filter({ hasText: 'パラメータ' }).count(), 3);
  await page.getByLabel('metrics.val/loss', { exact: true }).uncheck();
  await page.getByLabel('params.spk_emb', { exact: true }).uncheck();
  await page.locator('.column-menu summary').click();
  if (artifactsDirectory) {
    await mkdir(artifactsDirectory, { recursive: true });
    await page.screenshot({ path: `${artifactsDirectory}/runs-light.png`, fullPage: true });
  }

  // フィルタはAPIがMLflowの構文で評価する: '/'を含むキーはバッククォートで囲み、パラメータの値は
  // 引用符で囲んだ文字列にする。モックはすべてのRunを返すので、フィルタをかけている間は、ページが
  // 送る検索に、そのフィルタでAPIが返すはずのRunをこの手順で答える。
  const filter = "metrics.`val/loss` < 0.16 and params.batch_size = '32'";
  const filteredRuns = api.state.runs.filter(
    (run) => run.latestMetrics['val/loss'] < 0.16 && String(run.parameters.batch_size) === '32',
  );
  const answerFilteredSearch = (route) =>
    route.request().postDataJSON()?.filter === filter
      ? route.fulfill({
          contentType: 'application/json',
          body: JSON.stringify({ items: filteredRuns, nextCursor: null }),
        })
      : route.fallback();
  await page.route('**/api/projects/*/runs/search', answerFilteredSearch);
  await page.getByLabel('検索', { exact: true }).fill(filter);
  await page.getByRole('button', { name: '絞り込み', exact: true }).click();
  await page
    .getByRole('link', { name: 'training-test-02', exact: true })
    .waitFor({ state: 'hidden' });
  await page.getByRole('link', { name: 'training-test-01', exact: true }).waitFor();
  await page.getByLabel('検索', { exact: true }).fill('');
  await page.getByRole('button', { name: '絞り込み', exact: true }).click();
  await page.getByRole('link', { name: 'training-test-02', exact: true }).waitFor();
  await page.unroute('**/api/projects/*/runs/search', answerFilteredSearch);
  await page.getByLabel('Runを選択: training-test-01').check();
  await page.getByLabel('Runを選択: training-test-02').check();
  await page.getByRole('button', { name: '比較', exact: true }).click();
  await page.getByRole('heading', { name: '比較', exact: true }).waitFor();

  console.log('Browser check: run detail');
  const firstRun = api.state.runs[0];
  await page.goto(`${projectBase}/runs/${firstRun.id}`);
  await page.getByRole('heading', { name: firstRun.name, exact: true }).waitFor();
  // このタブはRunのシステムメトリクスの分類ごとにパネルを1つ描く（browser-charts.mjsが確かめる）。
  // このRunの最新のメトリクスにはシステムメトリクスが無い。
  await page.getByRole('tab', { name: 'System metrics' }).click();
  await page.getByText(/^システムメトリクスはまだありません。.*system_metrics=True/).waitFor();
  await page.getByRole('tab', { name: 'Artifacts', exact: true }).click();
  await page.getByText('Browser test artifact', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Artifactをアップロード' }).click();
  const runUploadDialog = page.getByRole('dialog');
  await uploadOneFile(runUploadDialog, {
    name: 'test-upload.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('test upload'),
  });
  await closeUploadDialog(runUploadDialog);
  await page.getByRole('button', { name: 'test-upload.txt', exact: true }).waitFor();
  await page.getByRole('tab', { name: 'Logs', exact: true }).click();
  await page.getByText('Browser test log', { exact: true }).waitFor();
  await page.getByRole('tab', { name: '詳細', exact: true }).click();
  await page.getByRole('button', { name: 'Runを編集' }).click();
  await page.getByRole('dialog').getByLabel('名前').fill('edited-training-test');
  await page.getByRole('dialog').getByRole('button', { name: '保存', exact: true }).click();
  await page.getByRole('heading', { name: 'edited-training-test' }).waitFor();

  console.log('Browser check: all screens');
  for (const [route, heading] of [
    ['models', 'Models'],
    ['codes', 'Code'],
    ['datasets', 'Datasets'],
    ['lineage', 'Lineage'],
    ['compute', '使えるコンピュータ'],
    ['plugins', '連携'],
    ['settings', 'プロジェクト設定'],
  ]) {
    await page.goto(`${projectBase}/${route}`);
    await page.getByRole('heading', { name: heading, exact: true }).waitFor();
    console.log(`Browser screen: ${route}`);
    assert.equal(await page.getByRole('alert').count(), 0, `${route} has an error`);
  }
  console.log('Browser check: model version');
  await page.goto(`${projectBase}/artifacts`);
  // Runに属さないArtifact: 完了したファイルには、コピーできるartifact:// URIが出る。
  await page.getByRole('button', { name: 'Artifactをアップロード', exact: true }).click();
  const standaloneUploadDialog = page.getByRole('dialog');
  const sourceRow = await uploadOneFile(standaloneUploadDialog, {
    name: 'source.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('browser source test'),
  });
  const sourceArtifact = api.state.artifacts.find((artifact) => artifact.path === 'source.txt');
  await sourceRow.getByText('artifact://' + sourceArtifact.id, { exact: true }).waitFor();
  await closeUploadDialog(standaloneUploadDialog);
  await page.goto(`${projectBase}/models`);
  await page.getByRole('button', { name: 'バージョンを作成', exact: true }).click();
  // 'バージョン'は'親のバージョン'と'既定のコードバージョン'にも含まれるので、アクセシブルネームの
  // 完全一致でその欄を選ぶ。
  await page.getByRole('dialog').getByRole('textbox', { name: 'バージョン', exact: true }).fill('v2');
  await page.getByRole('dialog').getByRole('button', { name: '保存', exact: true }).click();
  // 一覧の各バージョンは、それぞれのページへのリンクになっている。
  await page.getByRole('link', { name: 'v2', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Aliasを設定' }).click();
  await page.getByRole('dialog').getByLabel('Alias').fill('candidate');
  await page.getByRole('dialog').getByRole('button', { name: '保存', exact: true }).click();
  // aliasは、モデルの一覧のAlias列と、選んだモデルのaliasに出る。
  const aliasCells = page.getByRole('cell', { name: 'candidate', exact: true });
  await aliasCells.nth(0).waitFor();
  await aliasCells.nth(1).waitFor();

  console.log('Browser check: built-in Mado connections');
  await page.goto(`${projectBase}/plugins`);
  assert.equal(
    await page.getByRole('heading', { name: 'Storage metrics', exact: true }).count(),
    0,
  );
  assert.equal(
    api.state.calls.filter(
      (call) => call.path.endsWith('/metrics') && call.path.includes('/plugins/'),
    ).length,
    0,
  );
  await page.getByRole('button', { name: 'Madoの接続を追加', exact: true }).click();
  await page.getByRole('button', { name: 'Madoの接続設定', exact: true }).click();
  await page.getByRole('dialog').getByLabel('名前').fill('UI登録Mado');
  await page.getByRole('dialog').getByLabel('Mado API URL').fill('http://mado-api.invalid');
  await page.getByRole('dialog').getByLabel('Mado Web URL').fill('http://mado-web.invalid');
  await page.getByRole('dialog').getByRole('button', { name: '保存', exact: true }).click();
  await page.getByRole('heading', { name: 'UI登録Mado', exact: true }).waitFor();
  assert.equal(api.state.plugins.length, 2, 'global admin registration did not reach the API');
  assert.equal(api.state.plugins[1].enabled, false, 'a newly configured integration must stay disabled');
  assert.equal(api.state.plugins[1].kind, 'mado');
  await page.getByRole('button', { name: 'Mado', exact: true }).click();
  let releaseMetrics;
  api.state.metricsGate = new Promise((resolve) => {
    releaseMetrics = resolve;
  });
  await page.getByRole('button', { name: '接続を確認' }).click();
  await page.getByText('接続を確認しました', { exact: true }).waitFor();
  const storageMetrics = page.getByRole('region', { name: 'Storage metrics', exact: true });
  await storageMetrics.getByRole('status').waitFor();
  releaseMetrics();
  api.state.metricsGate = null;
  await storageMetrics.getByRole('heading', { name: 'UI検証ストレージ', exact: true }).waitFor();
  // formatBytesは小数1桁で表す（lib/format.ts）。3221225472バイトは'3.0 GiB'になる。
  await storageMetrics.getByText('3.0 GiB', { exact: true }).waitFor();
  assert.equal(await storageMetrics.getByText('120万', { exact: true }).count(), 1);
  assert.deepEqual(
    await storageMetrics
      .locator('tr')
      .filter({ hasText: 'unmeasured' })
      .locator('td')
      .allTextContents(),
    ['unmeasured', '—', '—', '—', '2'],
  );
  assert.equal(await storageMetrics.locator('.raw-metrics').getAttribute('open'), null);
  if (artifactsDirectory)
    await page.screenshot({
      path: `${artifactsDirectory}/plugin-metrics-light.png`,
      fullPage: true,
    });
  await storageMetrics.locator('.raw-metrics summary').click();
  assert.ok(
    (await storageMetrics.locator('pre').textContent()).includes('mado_storage_prefix_bytes'),
  );
  api.state.failPluginMetrics = true;
  await storageMetrics.getByRole('button', { name: 'メトリクスを更新' }).click();
  await storageMetrics.getByRole('alert').filter({ hasText: 'metrics unavailable' }).waitFor();
  assert.equal(
    await storageMetrics.locator('table').count(),
    0,
    'failed metrics kept displaying values',
  );
  api.state.failPluginMetrics = false;
  await storageMetrics.getByRole('button', { name: '再試行', exact: true }).click();
  await storageMetrics.getByText('3.0 GiB', { exact: true }).waitFor();
  const measuredPrometheus = api.state.prometheus;
  api.state.prometheus = '';
  await storageMetrics.getByRole('button', { name: 'メトリクスを更新' }).click();
  await storageMetrics.getByText('容量メトリクスはまだありません', { exact: true }).waitFor();
  assert.equal(await storageMetrics.locator('table').count(), 0);
  api.state.prometheus = measuredPrometheus;
  await storageMetrics.getByRole('button', { name: 'メトリクスを更新' }).click();
  await storageMetrics.getByText('3.0 GiB', { exact: true }).waitFor();

  console.log('Browser check: project admin plugin permissions');
  api.state.user.isAdmin = false;
  await page.reload();
  await page.getByRole('button', { name: '接続を確認' }).waitFor();
  assert.equal(await page.getByRole('button', { name: 'Madoの接続を追加', exact: true }).count(), 0);
  assert.equal(await page.getByRole('dialog').count(), 0);
  assert.equal(await page.getByRole('button', { name: 'Madoの接続設定', exact: true }).count(), 0);
  const forbiddenStatus = await page.evaluate(async (url) => {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        kind: 'mado',
        name: 'Forbidden',
        config: {
          apiUrl: 'http://mado-api.invalid', webUrl: 'http://mado-web.invalid',
          lineageUrl: 'http://mado-api.invalid',
          jobNamespace: 'test', storageSystemKey: 'test',
        },
        enabled: false,
      }),
    });
    return response.status;
  }, `/api/projects/${api.state.project.id}/plugins`);
  assert.equal(forbiddenStatus, 403);
  assert.equal(api.state.plugins.length, 2);
  await page.getByRole('button', { name: '接続を確認' }).click();
  await page.getByText('接続を確認しました', { exact: true }).waitFor();
  await storageMetrics.getByRole('button', { name: 'メトリクスを更新' }).click();
  await storageMetrics.getByText('3.0 GiB', { exact: true }).waitFor();
  await page.getByLabel('データセットを検索').fill('test');
  await page.getByRole('button', { name: '検索', exact: true }).click();
  await page.getByRole('button', { name: 'インポート', exact: true }).click();
  await page.getByText(/保存しました: UI検索データ/).waitFor();
  await page.getByRole('button', { name: 'イベントを再送' }).click();
  await page.getByText(/イベントをキューに追加しました: 2/).waitFor();
  // mado S3 Data Catalog側でtokenからCapacity Readを外す。次の接続確認からメトリクスは出なくなる。
  api.state.madoAccessTokenGrant = { ...api.state.madoAccessTokenGrant, scopes: ['lineage:read', 'lineage:write'] };
  api.state.plugins[0].configRevision++;
  api.state.plugins[0].manifest = null;
  api.state.plugins[0].accessTokenGrant = null;
  const metricsCalls = api.state.calls.filter(
    (call) => call.path.endsWith('/metrics') && call.path.includes('/plugins/'),
  ).length;
  await page.reload();
  await page.getByRole('button', { name: '接続を確認' }).waitFor();
  await page.getByRole('button', { name: '接続を確認' }).click();
  await page.getByText('接続を確認しました', { exact: true }).waitFor();
  assert.equal(
    await page.getByRole('heading', { name: 'Storage metrics', exact: true }).count(),
    0,
  );
  assert.equal(
    api.state.calls.filter(
      (call) => call.path.endsWith('/metrics') && call.path.includes('/plugins/'),
    ).length,
    metricsCalls,
  );
  api.state.user.isAdmin = true;

  console.log('Browser check: tokens');
  await page.goto(`${projectBase}/settings`);
  // 設定画面にはこのProject自身の設定だけがある。Projectは切り替えの最後の項目から作る。
  await page.getByRole('heading', { name: 'プロジェクト設定', exact: true }).waitFor();
  assert.equal(await page.getByRole('button', { name: 'プロジェクトを作成' }).count(), 0);
  const switcher = await openProjectSwitcher(page);
  await switcher.getByRole('option', { name: 'プロジェクトを作成', exact: true }).waitFor();
  await page.keyboard.press('Escape');
  await switcher.waitFor({ state: 'detached' });
  await page.getByRole('heading', { name: '監査ログ', exact: true }).waitFor();
  await page.getByRole('button', { name: 'API tokenを発行', exact: true }).click();
  await page.getByRole('dialog').getByLabel('名前').fill('browser-test-token');
  await page.getByRole('dialog').getByRole('button', { name: '保存', exact: true }).click();
  await page.getByText(/API tokenは一度だけ表示/).waitFor();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: '閉じる', exact: true })
    .last()
    .click();
  // tokenはこのProjectに限定しているので、Project adminには2か所に出る: 自分のtokenの中と、
  // Projectのtokenの一覧。
  const tokenSection = (heading) =>
    page
      .locator('.settings-section')
      .filter({ has: page.getByRole('heading', { name: heading, exact: true }) });
  const personalTokens = tokenSection('自分のAPI token');
  const projectTokens = tokenSection('Projectのtoken一覧');
  const issuedToken = (section) => section.getByText('browser-test-token', { exact: true });
  await issuedToken(projectTokens).waitFor();
  await personalTokens.getByRole('button', { name: '失効', exact: true }).click();
  await page.getByRole('dialog').getByText(/browser-test-token.*失効/).waitFor();
  await page.getByRole('dialog').getByRole('button', { name: '失効', exact: true }).click();
  await issuedToken(personalTokens).waitFor({ state: 'hidden' });
  await issuedToken(projectTokens).waitFor({ state: 'hidden' });

  console.log('Browser check: password change');
  await page.getByRole('button', { name: 'ユーザーメニュー', exact: true }).click();
  await page.getByRole('menuitem', { name: 'パスワードの変更', exact: true }).click();
  await page.waitForURL(`${base}/settings/account/password`);
  await page.locator('.page-header .eyebrow').getByText('全体設定', { exact: true }).waitFor();
  await page.getByLabel('現在のパスワード').fill('current-password-value');
  await page.getByLabel('新しいパスワード', { exact: true }).fill('new-password-value');
  await page.getByLabel('新しいパスワード（確認）').fill('new-password-value');
  await page.getByRole('button', { name: 'パスワードを変更', exact: true }).click();
  await page.getByRole('status').filter({ hasText: 'パスワードを変更しました' }).waitFor();

  console.log('Browser check: launch');
  await page.goto(`${projectBase}/jobs`);
  await page.getByRole('button', { name: 'ジョブを起動', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Run名').fill('browser-training-launch');
  await dialog.getByLabel('Experiments').selectOption(api.state.experiments[0].id);
  await dialog.getByLabel('実行種別').selectOption('training');
  await dialog.getByLabel('モデルバージョン', { exact: true }).selectOption(api.state.modelVersions[0].id);
  await dialog.getByLabel('コードバージョン').selectOption(api.state.codeVersions[0].id);
  await dialog.getByRole('button', { name: '次へ', exact: true }).click();
  await dialog.getByLabel('コンピュータ').selectOption(api.state.targets[0].id);
  await dialog.getByRole('button', { name: '次へ', exact: true }).click();
  // RunとそのJobは一緒に作る。Jobが断られると待機中のRunは残らず、やり直すとちょうど1つ作られる。
  const runsBeforeLaunch = api.state.runs.length;
  api.state.failNextJob = true;
  await dialog.getByRole('button', { name: 'ジョブを起動', exact: true }).click();
  await dialog.getByRole('alert').waitFor();
  assert.equal(api.state.runs.length, runsBeforeLaunch, 'a refused Job left a queued Run behind');
  await dialog.getByRole('button', { name: 'ジョブを起動', exact: true }).click();
  await dialog.waitFor({ state: 'hidden' });
  assert.equal(api.state.runs.length, runsBeforeLaunch + 1, 'the launch did not make one Run');
  assert.equal(api.state.jobs[0].gpuIds.length, 0, 'CPU selection must remain empty');
  await page.getByRole('button', { name: '停止を要求', exact: true }).click();
  await page.getByRole('dialog', { name: 'Jobの停止' }).getByRole('button', { name: '停止する', exact: true }).click();
  // 起動するとJobの詳細が開くので、その行と詳細の両方に停止の要求が出る。
  await page.getByRole('cell').getByText('停止要求済み', { exact: true }).waitFor();
  await page.locator('.job-detail').getByText('停止要求済み', { exact: true }).waitFor();

  console.log('Browser check: errors/theme/mobile');
  api.state.failRunList = true;
  await page.goto(`${projectBase}/experiments`);
  // codeの付いたAPIの失敗も、日本語の画面でAPIの文をそのまま出す（codeから訳さない）。
  await page
    .getByRole('alert')
    .filter({ hasText: 'UI verification: database unavailable' })
    .waitFor();
  assert.equal(await page.getByText('データベースに接続できません').count(), 0);
  assert.equal(await page.getByRole('link', { name: 'training-test-02', exact: true }).count(), 0);
  api.state.failRunList = false;
  await page.getByRole('alert').getByRole('button', { name: '再試行', exact: true }).click();
  await page.getByRole('link', { name: 'training-test-02', exact: true }).waitFor();
  await page.getByRole('button', { name: 'ダークテーマ', exact: true }).click();
  if (artifactsDirectory)
    await page.screenshot({ path: `${artifactsDirectory}/runs-dark.png`, fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await waitForNoHorizontalOverflow(page, 'mobile viewport overflows');
  if (artifactsDirectory)
    await page.screenshot({ path: `${artifactsDirectory}/runs-mobile.png`, fullPage: true });
  api.state.loggedIn = false;
  api.state.authMode = 'oidc';
  const returnPath = `/projects/${api.state.project.id}/runs/${firstRun.id}?tab=details`;
  await page.goto(base + returnPath);
  await page.getByRole('link', { name: 'Authentik', exact: true }).waitFor();
  assert.equal(
    await page.getByRole('button', { name: '開発モードでログイン', exact: true }).count(),
    0,
  );
  await page.getByRole('link', { name: 'Authentik', exact: true }).click();
  await page.waitForURL(base + returnPath);
  await page.getByRole('tab', { name: '詳細', exact: true }).waitFor();
  assert.deepEqual(pageErrors, []);
  assert.equal(
    api.state.calls.some((call) => call.path.includes('/worker/')),
    false,
  );
  console.log(
    'Browser smoke passed: authentication, all screens, compact columns, filtering, comparison, previews, upload, version/alias, built-in Mado configuration permissions/metrics/import, tokens, CPU launch, enqueue retry, cancellation, API errors, theme, mobile.',
  );
} finally {
  await browser.close();
}
