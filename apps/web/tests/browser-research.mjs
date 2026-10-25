// 統合済みの画面にある研究向けの機能を、scripts/verify_research_features.pyが分離したAPIへSDKで
// 記録したデータで確かめる: Runの詳細の図のパネル（平滑化、x軸、再開の境目）、System metricsの
// タブ、メディアのスライダーと音声、説明文とコメント、比較（線の重ね合わせ、並べての聞き比べ、
// Analysis）、保存ビューのURLから開くRunの一覧（グループ化とビューの図）、Sweepの詳細、レポート
// （最新を反映する図とスナップショット）。待ち合わせはページの状態をポーリングし、決まった時間の
// sleepは使わない。
import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';
import http from 'node:http';
import net from 'node:net';
import { pathToFileURL } from 'node:url';

const modulePath = process.env.MMT_PLAYWRIGHT_MODULE;
if (!modulePath) throw new Error('Set MMT_PLAYWRIGHT_MODULE to an installed Playwright index.mjs');
const fixturePath = process.env.MMT_RESEARCH_FIXTURE;
if (!fixturePath) throw new Error('Set MMT_RESEARCH_FIXTURE to the browser-fixture.json of verify_research_features.py');
const { chromium } = await import(pathToFileURL(modulePath).href);
const webUrl = process.env.MMT_WEB_URL ?? 'http://127.0.0.1:47011';
assert.equal(new URL(webUrl).hostname, '127.0.0.1', 'This verification only uses the local isolated API');
// 分離したAPIは、設定したWebのOriginからのcookie付きの要求しか受け付けず、Chromiumではテストから
// Originを書き換えられない。そこでブラウザはWebの手前に置いたループバックの中継と通信し、中継が
// 代わりにそのOriginを送る。
const apiOrigin = process.env.MMT_API_ORIGIN ?? 'http://127.0.0.1:5182';
const relayPort = Number(process.env.MMT_RESEARCH_RELAY_PORT ?? 47014);
const base = `http://127.0.0.1:${relayPort}`;
const screenshotDirectory = process.env.MMT_SCREENSHOT_DIR;
const fixture = JSON.parse(await readFile(fixturePath, 'utf8'));
const projectBase = `${base}/projects/${fixture.projectId}`;
// verify_research_features.pyに合わせる: メディアはstep 9、19、29と39（再開のあと）。
const MEDIA_STEPS = [9, 19, 29];
const RESUMED_LAST_STEP = 39;
const WAIT_TIMEOUT_MS = 30_000;
const POLL_INTERVAL_MS = 200;

const browser = await chromium.launch({
  headless: true,
  ...(process.env.MMT_CHROMIUM_PATH ? { executablePath: process.env.MMT_CHROMIUM_PATH } : {}),
  args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'],
});
const errors = [];

/** Web（とそのHMRのWebSocket）へ転送し、要求のOriginをapiOriginに置き換える。 */
function startOriginRelay() {
  const target = new URL(webUrl);
  const withApiOrigin = (headers) => ({ ...headers, host: target.host, ...(headers.origin ? { origin: apiOrigin } : {}) });
  const server = http.createServer((request, response) => {
    const forwarded = http.request(
      { host: target.hostname, port: target.port, method: request.method, path: request.url, headers: withApiOrigin(request.headers) },
      (upstream) => {
        response.writeHead(upstream.statusCode ?? 502, upstream.headers);
        upstream.pipe(response);
      },
    );
    forwarded.on('error', () => response.destroy());
    request.pipe(forwarded);
  });
  server.on('upgrade', (request, socket, head) => {
    const upstream = net.connect(Number(target.port), target.hostname, () => {
      const headers = Object.entries(withApiOrigin(request.headers)).map(([name, value]) => `${name}: ${value}`);
      upstream.write([`${request.method} ${request.url} HTTP/1.1`, ...headers, '', ''].join('\r\n'));
      upstream.write(head);
      upstream.pipe(socket).pipe(upstream);
    });
    upstream.on('error', () => socket.destroy());
    socket.on('error', () => upstream.destroy());
  });
  return new Promise((resolve) => server.listen(relayPort, '127.0.0.1', () => resolve(server)));
}

function step(message) {
  console.log(`step: ${message}`);
}

async function screenshot(page, name) {
  if (!screenshotDirectory) return;
  await mkdir(screenshotDirectory, { recursive: true });
  await page.screenshot({ path: `${screenshotDirectory}/${name}.png`, fullPage: true });
}

/** 決まった時間のsleepでなく、ページ自身の更新と同じようにconditionが真になるまでポーリングする。 */
async function waitUntil(condition, message) {
  const deadline = Date.now() + WAIT_TIMEOUT_MS;
  for (;;) {
    const value = await condition();
    if (value) return value;
    if (Date.now() > deadline) throw new Error(`Timed out: ${message}`);
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
}

async function signIn() {
  const context = await browser.newContext({ locale: 'ja-JP', viewport: { width: 1440, height: 1100 } });
  // データを記録したのと同じ開発用の利用者にして、本人だけに見える状態も一致させる。
  const login = await context.request.post(`${base}/api/auth/dev-login`, { headers: { Origin: base }, data: {} });
  assert.equal(login.ok(), true, `dev-login: ${login.status()}`);
  const page = await context.newPage();
  page.on('pageerror', (error) => errors.push(error.message));
  return { context, page };
}

async function apiGet(context, path) {
  const response = await context.request.get(`${base}/api/projects/${fixture.projectId}${path}`);
  assert.equal(response.ok(), true, `GET ${path}: ${response.status()}`);
  return response.json();
}

const panel = (page, title) => page.locator('article.chart-panel', { has: page.getByRole('heading', { name: title, exact: true }) });
const linePaths = (scope) => scope.locator('path.chart-line');
// 平らな線（値が一定のメトリクス）は箱の高さが0になり、Playwrightはそれを非表示とみなす。
const waitForLine = (scope) => linePaths(scope).first().waitFor({ state: 'attached' });
const pathData = (scope) => linePaths(scope).evaluateAll((paths) => paths.map((path) => path.getAttribute('d')).join('|'));

async function openTab(page, name) {
  await page.getByRole('tab', { name, exact: true }).click();
  await page.locator(`#run-tab-panel[aria-label="${name}"]`).waitFor();
}

// --- Runの詳細 ----------------------------------------------------------------------------------
async function checkRunCharts(page) {
  step('Run detail: chart panel, resume boundary, smoothing and x axis');
  await page.goto(`${projectBase}/runs/${fixture.onlineRunId}?tab=metrics`);
  const timeline = page.getByRole('region', { name: '実行区間' });
  await timeline.getByRole('cell', { name: '再開 1', exact: true }).waitFor();
  assert.equal(await timeline.locator('.resume-band').count(), 2, 'two segments: the first run and the resume');
  const loss = panel(page, 'loss');
  await waitForLine(loss);
  await loss.locator('g.chart-marker', { hasText: '再開' }).first().waitFor({ state: 'attached' });
  const rawLine = await pathData(loss);
  await screenshot(page, '01-run-metrics');

  await loss.getByRole('button', { name: '図を設定' }).click();
  const settings = page.getByRole('dialog', { name: '図を設定' });
  await settings.getByRole('combobox', { name: '平滑化', exact: true }).selectOption('ema');
  await waitUntil(async () => (await settings.locator('.chart-weight output').textContent())?.trim() === '0.60', 'smoothing weight 0.60');
  await settings.getByRole('combobox', { name: 'x軸', exact: true }).selectOption('relative_time');
  await settings.getByRole('button', { name: '保存' }).click();
  await settings.waitFor({ state: 'detached' });
  const smoothedLine = await waitUntil(async () => {
    const data = await pathData(loss);
    return data && data !== rawLine ? data : null;
  }, 'the loss line to be redrawn smoothed on the elapsed-time axis');
  // 再開の印は軸に従う。経過時間の軸では、再開した時刻の位置に来る。
  await loss.locator('g.chart-marker', { hasText: '再開' }).first().waitFor({ state: 'attached' });
  await screenshot(page, '02-run-metrics-smoothed-relative-time');
  return { smoothedLineChanged: smoothedLine !== rawLine };
}

async function checkSystemMetrics(page) {
  step('Run detail: System metrics tab');
  await openTab(page, 'System metrics');
  for (const title of ['CPU（%）', 'メモリ（%）']) await waitForLine(panel(page, title));
  await screenshot(page, '03-run-system-metrics');
}

async function checkRunMedia(page) {
  step('Run detail: media slider, audio and the table');
  await openTab(page, 'Media');
  const keys = page.getByRole('region', { name: 'メディアのキー' });
  await keys.getByRole('button', { name: 'inference/tone', exact: true }).click();
  const slider = page.getByRole('slider', { name: '表示するstep' });
  const lastIndex = MEDIA_STEPS.length + 1;
  await waitUntil(async () => (await slider.getAttribute('aria-valuetext')) === `step ${RESUMED_LAST_STEP}（${lastIndex} / ${lastIndex}）`, 'the latest step after the resume');
  await page.getByRole('button', { name: '前のstep' }).click();
  await page.locator('output.media-step-value', { hasText: `step ${MEDIA_STEPS[2]}（${lastIndex - 1} / ${lastIndex}）` }).waitFor();
  const stepSection = page.locator('section.run-media-step');
  await stepSection.locator('audio').first().waitFor({ state: 'attached' });
  await stepSection.locator('canvas.audio-spectrogram').first().waitFor({ state: 'attached' });
  await page.locator('.media-info', { hasText: '16,000 Hz' }).first().waitFor();
  await screenshot(page, '04-run-media-audio');
  await keys.getByRole('button', { name: 'evaluation/samples', exact: true }).click();
  const table = page.locator('.media-table');
  await table.locator('.media-table-toolbar', { hasText: '3行' }).waitFor();
  await table.getByRole('cell', { name: 'こんにちは' }).waitFor();
  assert.equal(await table.locator('tbody audio').count() > 0, true, 'the audio column plays in the table');
  await screenshot(page, '05-run-media-table');
}

async function checkDescriptionAndComments(page) {
  step('Run detail: description from mlflow.note.content and comments');
  await openTab(page, '詳細');
  const description = page.locator('section.run-description .markdown-view');
  await description.getByRole('heading', { name: '学習の説明' }).waitFor();
  await description.getByText('MLflow の set-tag から追記').waitFor();
  const comments = page.getByRole('region', { name: 'コメント' });
  const [threadBody, replyBody] = fixture.commentBodies;
  const thread = comments.locator('li.comment-thread-group', { hasText: threadBody });
  await thread.locator('.comment-replies article.comment-item', { hasText: replyBody }).waitFor();
  const newComment = 'ブラウザから: 再開の境界が図に出ている';
  const posted = comments.locator('article.comment-item', { hasText: newComment });
  // 保持したデータで再実行しても（--hold）新しいコメントを確かめられるよう、先に数えておく。
  const postedBefore = await posted.count();
  await comments.locator('form.comment-editor').getByRole('textbox', { name: 'コメント' }).fill(newComment);
  await comments.locator('form.comment-editor').getByRole('button', { name: '投稿' }).click();
  await waitUntil(async () => (await posted.count()) === postedBefore + 1, 'the posted comment');
  await screenshot(page, '06-run-details-comments');
}

// --- 比較 ---------------------------------------------------------------------------------------
async function checkCompare(page, runNames) {
  const runs = `${fixture.onlineRunId},${fixture.offlineRunId}`;
  step('Compare: overlaid loss of the online and the synced offline Run');
  await page.goto(`${projectBase}/compare?runs=${runs}`);
  const loss = panel(page, 'loss');
  await waitUntil(async () => (await loss.locator('path.chart-line.run').count()) === 2, 'two overlaid lines');
  await screenshot(page, '07-compare-overlay');

  step('Compare: listening to the two Runs side by side');
  await page.getByRole('tab', { name: 'Media', exact: true }).click();
  await page.getByLabel('比較するキー').selectOption('inference/tone');
  await page.getByRole('textbox', { name: '比較するstep' }).fill(MEDIA_STEPS.join(', '));
  await page.getByRole('button', { name: '表示', exact: true }).click();
  const grid = page.getByRole('grid', { name: 'Run × step のメディア' });
  const expectedHeader = ['Run', ...MEDIA_STEPS.map((value) => `step ${value}`)].join('|');
  await waitUntil(async () => (await grid.locator('thead th').allInnerTexts()).join('|') === expectedHeader, `grid header ${expectedHeader}`);
  assert.equal(await grid.locator('.media-compare-cell.missing').count(), 0, 'both Runs have audio at every step');
  for (const name of [runNames.online, runNames.offline]) {
    await grid.getByRole('button', { name: `${name}、step ${MEDIA_STEPS[1]}、音声` }).click();
    const detail = page.locator('.media-compare-detail');
    await detail.getByRole('heading', { name: `${name} · step ${MEDIA_STEPS[1]}` }).waitFor();
    await detail.locator('audio').waitFor({ state: 'attached' });
  }
  await screenshot(page, '08-compare-media');

  step('Compare: Analysis');
  await page.getByRole('tab', { name: 'Analysis', exact: true }).click();
  const analysis = page.getByRole('region', { name: '探索結果の分析' });
  await analysis.locator('[data-testid=parallel-selection-count]', { hasText: '2 件中 2 件' }).waitFor();
  await screenshot(page, '09-compare-analysis');
}

// --- 保存ビューから開くRunの一覧 ----------------------------------------------------------------
async function checkSavedView(page) {
  step('Run list: the saved view URL restores grouping and its chart');
  await page.goto(`${projectBase}/experiments?view=${fixture.savedViewId}`);
  await page.locator('details.saved-views-menu > summary', { hasText: `ビュー: ${fixture.savedViewName}` }).waitFor();
  await waitUntil(() => {
    const url = new URL(page.url());
    return url.searchParams.get('view') === fixture.savedViewId && url.searchParams.get('charts') === '1';
  }, 'the URL to keep the view and open the charts');
  assert.equal(await page.getByRole('combobox', { name: /^グループ化/ }).first().inputValue(), 'param');
  assert.equal(await page.getByLabel('グループ化するキー').inputValue(), 'batch_size');
  // Sweepの試行はval_lossを記録する。gridのbatch_sizeごとに平均の線が1本ずつ出る。
  const viewPanel = panel(page, '研究: val_loss');
  // val_lossの無いRunは(none)のグループになり、凡例には出るが描く線が無い。
  const drawnGroupLines = () =>
    viewPanel.locator('path.chart-line.group').evaluateAll((paths) => paths.filter((path) => path.getAttribute('d')?.includes('L')).length);
  await waitUntil(async () => (await drawnGroupLines()) === 2, 'one mean line per batch_size group');
  const legend = await viewPanel.locator('.chart-legend-label').allInnerTexts();
  for (const group of ['4（平均）', '32（平均）']) assert.ok(legend.includes(group), `legend ${legend.join(', ')} lacks ${group}`);
  await page.locator('table.run-table a.run-name', { hasText: 'research-online' }).waitFor();
  await screenshot(page, '10-run-list-saved-view');
}

// --- Sweepの詳細 --------------------------------------------------------------------------------
async function checkSweep(page, sweep) {
  step('Sweep detail: status, best trial, trials and analysis');
  await page.goto(`${projectBase}/sweeps/${fixture.sweepId}`);
  const summary = page.locator('[data-testid=sweep-summary]');
  await summary.locator('.sweep-summary-status', { hasText: '完了' }).waitFor();
  await summary.locator('[data-testid=sweep-best-trial]', { hasText: `#${sweep.bestTrial.trialIndex}` }).waitFor();
  const trials = page.locator('[data-testid=sweep-trials]');
  await waitUntil(async () => (await trials.locator('tbody tr').count()) === sweep.trialCounts.total, 'every trial row');
  assert.equal(await trials.getByRole('link', { name: 'Runを開く' }).count(), sweep.trialCounts.total);
  const analysis = page.getByRole('region', { name: '探索結果の分析' });
  await analysis.locator('[data-testid=parallel-selection-count]', { hasText: `${sweep.trialCounts.total} 件中` }).waitFor();
  await analysis.getByRole('tab', { name: 'パラメータ重要度' }).click();
  await analysis.locator('.importance-table tr[data-param=lr]').waitFor();
  await screenshot(page, '11-sweep-detail');
}

// --- レポート -----------------------------------------------------------------------------------
async function checkReport(page) {
  step('Report: Markdown, live and fixed charts, importance, media, Run list and comments');
  await page.goto(`${projectBase}/reports/${fixture.reportId}`);
  const report = page.locator('[data-testid=report-page]');
  await report.locator('.page-header').getByRole('heading', { name: fixture.reportTitle, level: 1 }).waitFor();
  await report.locator('.report-markdown .markdown-view').getByRole('heading', { name: '研究機能の通し確認' }).waitFor();
  const charts = report.locator('figure.report-embed[data-block-type=chart]');
  await waitUntil(async () => (await charts.count()) === 2, 'the live and the fixed chart');
  const live = charts.filter({ has: page.getByTestId('report-live-mark') });
  const fixed = charts.filter({ has: page.locator('[data-testid=report-snapshot-mark]') });
  await live.getByTestId('report-live-mark').getByText('最新データ').waitFor();
  await fixed.locator('[data-testid=report-snapshot-mark]', { hasText: '時点で固定' }).waitFor();
  await waitForLine(live);
  await waitForLine(fixed);
  // 検証は保存のあとでlossの点を1つ記録した。その点を描くのは最新を反映する図だけ。
  assert.notEqual(await pathData(live), await pathData(fixed), 'the live chart should include the point logged after saving');
  await report.locator('figure.report-embed[data-block-type=parameter_importance] .importance-table tr[data-param=lr]').waitFor();
  const media = report.locator('figure.report-embed[data-block-type=media]');
  await media.getByRole('grid', { name: 'Run × step のメディア' }).waitFor();
  await report.locator('figure.report-embed[data-block-type=run_table] table.run-table a.run-name', { hasText: 'research-online' }).waitFor();
  await page.getByRole('region', { name: 'コメント' }).locator('article.comment-item', { hasText: '固定の図は変わらない' }).waitFor();
  await screenshot(page, '12-report');
}

const results = {};
const relay = await startOriginRelay();
try {
  const { context, page } = await signIn();
  const [online, offline, sweep] = await Promise.all([
    apiGet(context, `/runs/${fixture.onlineRunId}`),
    apiGet(context, `/runs/${fixture.offlineRunId}`),
    apiGet(context, `/sweeps/${fixture.sweepId}`),
  ]);
  results.runCharts = await checkRunCharts(page);
  await checkSystemMetrics(page);
  await checkRunMedia(page);
  await checkDescriptionAndComments(page);
  await checkCompare(page, { online: online.name, offline: offline.name });
  await checkSavedView(page);
  await checkSweep(page, sweep);
  await checkReport(page);
  assert.deepEqual(errors, [], `page errors: ${errors.join('\n')}`);
  console.log(JSON.stringify({ passed: true, ...results }));
} finally {
  await browser.close();
  relay.closeAllConnections();
  relay.close();
}
