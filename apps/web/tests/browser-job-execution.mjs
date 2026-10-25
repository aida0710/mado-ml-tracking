// 実行の画面の確認。MMT_WEB_URLのWebの裏に開発モードのAPI（AUTH_MODE=development）を置き、
// workerは動かさない。
// - どのworkerも受け持たないコンピュータに、Compute、起動のダイアログ、Jobsの一覧の上、待っている
//   Jobで印を付け、（リンクから開く）その詳細は接続の確認の前に警告する。
// - Jobを選ぶとその詳細が見える位置に来る。ログは最新の2,000行（3,000行のうち）の最も新しい行で
//   開き、秒まで出て、検索、逆順、全文の読み込み（数秒ごとの読み直しは止まる）、APIがストリームで
//   返すファイルとしてのダウンロードができる。
// - 最大の試行回数を超えたJobは、起動した本人が再試行できる。
// - Jobを断られた起動ではRunが残らない。Runの画面は2回目の起動を勧めず、Runが止まった後も
//   そのJobへのリンクを出す。
// - フックは設定ごと作成のダイアログに写せる。
// 390pxではJobsとComputeの画面が横にスクロールしない。MMT_SCREENSHOT_DIRを設定すると、そこに
// スクリーンショットを保存する。
import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const modulePath = process.env.MMT_PLAYWRIGHT_MODULE;
if (!modulePath) throw new Error('Set MMT_PLAYWRIGHT_MODULE to an installed Playwright index.mjs');
const { chromium } = await import(pathToFileURL(modulePath).href);
const base = process.env.MMT_WEB_URL ?? 'http://127.0.0.1:5182';
const adminEmail = process.env.MMT_DEVELOPMENT_ADMIN_EMAIL ?? 'admin@localhost';
const outputDirectory = process.env.MMT_SCREENSHOT_DIR;
if (outputDirectory) await mkdir(outputDirectory, { recursive: true });
// 実行ごとにユーザー、Project、コンピュータを作るので、実行どうしで互いの記録が見えない。
const runKey = Date.now().toString(36);
const DESKTOP = { width: 1440, height: 900 };
const PHONE = { width: 390, height: 844 };
// 画面がポーリングする2,000行（RUN_LOG_TAIL_LINES）より多くし、APIが受け付ける件数ずつに分けて送る。
const LOG_LINES = 3000;
const LOG_BATCH = 1000;
const SHOWN_LOG_LINES = 2000;
// 画面は5秒ごとにポーリングする（EXECUTION_POLL_MS）。それより長く待てば、ポーリングが残っているかが分かる。
const LONGER_THAN_ONE_POLL_MS = 6000;

const browser = await chromium.launch({
  headless: true,
  ...(process.env.MMT_CHROMIUM_PATH ? { executablePath: process.env.MMT_CHROMIUM_PATH } : {}),
  args: ['--no-sandbox'],
});
const pageErrors = [];

async function signIn(email, displayName, viewport = DESKTOP) {
  const context = await browser.newContext({ locale: 'ja-JP', viewport, acceptDownloads: true });
  const login = await context.request.post(`${base}/api/auth/dev-login`, {
    headers: { Origin: base },
    data: { email, displayName },
  });
  assert.equal(login.ok(), true, `dev-login ${email}: ${login.status()}`);
  const { user } = await login.json();
  const call = async (method, path, data) => {
    const response = await context.request.fetch(`${base}/api${path}`, {
      method,
      headers: { Origin: base },
      ...(data ? { data } : {}),
    });
    assert.equal(response.ok(), true, `${method} ${path}: ${response.status()} ${await response.text()}`);
    return response.status() === 204 ? null : response.json();
  };
  const page = await context.newPage();
  page.on('pageerror', (error) => pageErrors.push(error.message));
  return {
    page,
    user,
    get: (path) => call('GET', path),
    post: (path, data) => call('POST', path, data),
    put: (path, data) => call('PUT', path, data),
    patch: (path, data) => call('PATCH', path, data),
  };
}

async function screenshot(page, name, options = {}) {
  if (outputDirectory) await page.screenshot({ path: `${outputDirectory}/${name}.png`, ...options });
}
async function assertNoSidewaysScroll(page, where) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  assert.ok(overflow <= 0, `${where} scrolls sideways by ${overflow}px at 390px`);
}
/** 05:00:00から1秒ごとに1行のログ。失敗する学習が書くように、最後はtracebackで終わる。 */
function logEntry(index) {
  const timestamp = new Date(Date.UTC(2026, 9, 11, 5, 0, index)).toISOString();
  if (index === LOG_LINES - 1)
    return { timestamp, level: 'error', message: 'Traceback (most recent call last): CUDA out of memory' };
  return { timestamp, level: 'info', message: `step ${index} loss=${(1 / (index + 1)).toFixed(4)}` };
}

try {
  console.log('Setup: a Project, an ssh computer no worker takes, a waiting Job with a long log');
  const admin = await signIn(adminEmail, '全体管理者');
  assert.equal(admin.user.isAdmin, true, `${adminEmail} must be DEVELOPMENT_ADMIN_EMAIL`);
  const editor = await signIn(`exec-editor-${runKey}@localhost`, '研究者A');
  const project = await admin.post('/projects', { name: `実行の確認 ${runKey}`, visibility: 'private' });
  await admin.put(`/projects/${project.id}/members/${editor.user.id}`, { role: 'editor' });
  const projectBase = `${base}/projects/${project.id}`;
  const experiment = await editor.post(`/projects/${project.id}/experiments`, { name: '学習' });
  const gpuHost = await admin.post('/targets', {
    name: `GPU機 ${runKey}`,
    executor: 'ssh',
    visibility: 'public',
    host: 'gpu-b.lab.example',
    port: 22,
    username: 'mmt',
    sshKeyPath: '~/.ssh/id_ed25519',
    knownHostsPath: '~/.ssh/known_hosts',
    workDirectory: '/srv/mmt',
    pythonExecutable: 'python3',
    runtimeKinds: ['python'],
    gpuIds: ['0', '1'],
    maxConcurrentJobs: 1,
    enabled: true,
  });
  const code = await editor.post(`/projects/${project.id}/codes`, { name: 'train' });
  const codeVersion = await editor.post(`/projects/${project.id}/codes/${code.id}/versions`, {
    version: 'v1',
    source: { kind: 'inline', files: { 'train.py': 'print("train")\n' } },
    entrypoint: ['python', 'train.py'],
    supportedModelFamilies: ['asr'],
    taskTypes: ['training'],
  });
  const run = await editor.post(`/projects/${project.id}/runs`, {
    experimentId: experiment.id,
    name: 'long-log',
    kind: 'training',
    codeVersionId: codeVersion.id,
  });
  for (let start = 0; start < LOG_LINES; start += LOG_BATCH)
    await editor.post(`/projects/${project.id}/runs/${run.id}/logs`, {
      entries: Array.from({ length: LOG_BATCH }, (_, offset) => logEntry(start + offset)),
    });
  // フックのJob。試行は1回なので、この変更の前は人が実行し直せなかった。
  const job = await editor.post(`/projects/${project.id}/jobs`, {
    runId: run.id,
    targetId: gpuHost.id,
    gpuIds: [],
    maxAttempts: 1,
  });

  console.log('Compute: the computer is enabled but no worker takes it');
  const { page } = editor;
  await page.goto(`${projectBase}/compute`);
  const computeRow = page.getByRole('row').filter({ hasText: gpuHost.name });
  await computeRow.getByText('workerなし', { exact: true }).waitFor();
  await screenshot(page, '01-compute-worker-missing');

  console.log('Jobs: the waiting Job is named above the list, and its details come into view');
  await page.goto(`${projectBase}/jobs`);
  const workerless = page.locator('section.worker-missing');
  await workerless.getByText(`${gpuHost.name}: 待機中 1件`, { exact: true }).waitFor();
  await screenshot(page, '02-jobs-workerless-notice');
  await page.getByRole('button', { name: job.id.slice(0, 8), exact: true }).click();
  const heading = page.getByRole('heading', { name: 'long-log', exact: true, level: 2 });
  await heading.waitFor();
  await page.waitForFunction(() => {
    const element = document.getElementById('job-detail-heading');
    const box = element?.getBoundingClientRect();
    return Boolean(box && box.top >= 0 && box.top < innerHeight / 2 && document.activeElement === element);
  });
  const detail = page.locator('section.job-detail');
  await detail.getByText(`「${gpuHost.name}」を担当するworkerがいません`, { exact: false }).waitFor();

  console.log('Logs: the latest 2,000 lines, opened at the newest, with seconds');
  const logReads = [];
  page.on('request', (request) => {
    if (new URL(request.url()).pathname.endsWith(`/runs/${run.id}/logs`)) logReads.push(request.url());
  });
  const logView = detail.getByRole('log');
  await detail.getByText('最新の2,000行を表示しています（全3,000行）', { exact: false }).waitFor();
  assert.equal(await logView.locator('.log-entry').count(), SHOWN_LOG_LINES);
  await page.waitForFunction(() => {
    const view = document.querySelector('.job-detail .log-view');
    return view && view.scrollHeight - view.clientHeight - view.scrollTop < 30;
  });
  assert.match(await logView.locator('.log-entry time').last().innerText(), /\d{1,2}:\d{2}:\d{2}$/);
  await screenshot(page, '03-job-detail-log-latest');
  await detail.getByRole('searchbox', { name: 'ログを検索' }).fill('cuda');
  await detail.getByText('1行が一致', { exact: true }).waitFor();
  assert.equal(await logView.locator('.log-entry').count(), 1);
  await screenshot(page, '04-job-log-search');
  await detail.getByRole('searchbox', { name: 'ログを検索' }).fill('');
  await detail.getByLabel('並び順').selectOption('newestFirst');
  assert.match(await logView.locator('.log-entry').first().innerText(), /Traceback/);
  await detail.getByRole('button', { name: 'すべての行を読み込む', exact: true }).click();
  await page.waitForFunction(
    (count) => document.querySelectorAll('.job-detail .log-entry').length === count,
    LOG_LINES,
  );
  // 待っているJobはまだ終わっていないが、全行は数秒ごとではなく1回だけ読む。
  const readsOfEveryLine = logReads.length;
  await page.waitForTimeout(LONGER_THAN_ONE_POLL_MS);
  assert.equal(logReads.length, readsOfEveryLine, 'the log was read again after reading every line');
  await detail.getByText('読み込んだ時点の行です。自動では更新しません。', { exact: false }).waitFor();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    detail.getByRole('link', { name: 'ダウンロード', exact: true }).click(),
  ]);
  assert.equal(download.suggestedFilename(), 'long-log.log');
  const downloaded = (await readFile(await download.path(), 'utf8')).split('\n');
  assert.equal(downloaded.pop(), '', 'the file ends with a line break');
  assert.equal(downloaded.length, LOG_LINES);
  assert.match(downloaded.at(-1), /\tERROR\tTraceback/);

  console.log('Run page: the Run already has its Job, so it links to it instead of launching again');
  await page.goto(`${projectBase}/runs/${run.id}`);
  await page.getByRole('link', { name: 'Jobを見る', exact: true }).waitFor();
  assert.equal(await page.getByRole('button', { name: 'ジョブを起動', exact: true }).count(), 0);

  console.log('Retry: a Job at its maximum attempts is retried by the person who started it');
  await page.goto(`${projectBase}/jobs?job=${job.id}`);
  const jobRow = page.getByRole('row').filter({ hasText: job.id.slice(0, 8) });
  await jobRow.getByRole('button', { name: '停止を要求', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: '停止する', exact: true }).click();
  await jobRow.getByText('1 / 1', { exact: true }).waitFor();
  await jobRow.getByRole('button', { name: '新しいRunで再実行', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: '再実行する', exact: true }).click();
  await page.waitForURL(new RegExp(`/projects/${project.id}/runs/(?!${run.id})`));
  await page.getByRole('heading', { name: 'long-log (retry 2)', exact: true }).waitFor();
  const retried = (await editor.get(`/projects/${project.id}/jobs`)).items.find(
    (item) => item.runName === 'long-log (retry 2)',
  );
  assert.equal(retried.attempt, 2);
  await page.goto(`${projectBase}/runs/${run.id}`);
  await page.getByRole('link', { name: 'Jobを見る', exact: true }).waitFor();
  await page.goto(`${projectBase}/jobs`);
  await page.getByText('2（自動の再実行は1回目まで）', { exact: true }).waitFor();

  console.log('Launch: the computer is marked, and a refused Job leaves no Run');
  await page.getByRole('button', { name: 'ジョブを起動', exact: true }).click();
  const launch = page.getByRole('dialog');
  await launch.getByLabel('Run名').fill('refused-launch');
  await launch.getByLabel('Experiments').selectOption(experiment.id);
  await launch.getByLabel('実行種別').selectOption('training');
  await launch.getByLabel('コードバージョン').selectOption(codeVersion.id);
  await launch.getByRole('button', { name: '次へ', exact: true }).click();
  const targetSelect = launch.getByLabel('コンピュータ');
  const targetLabel = await targetSelect
    .locator(`option[value="${gpuHost.id}"]`)
    .innerText();
  assert.match(targetLabel, /（workerなし）$/);
  await targetSelect.selectOption(gpuHost.id);
  await launch.getByText('このまま起動すると、Jobはworkerが動くまで待機中のままです。', { exact: false }).waitFor();
  await screenshot(page, '05-launch-worker-missing');
  await launch.getByRole('button', { name: '次へ', exact: true }).click();
  // ダイアログを開いている間にコンピュータがJobを受け付けなくなるので、APIはそのJobを断る。
  await admin.patch(`/targets/${gpuHost.id}`, { enabled: false });
  await launch.getByRole('button', { name: 'ジョブを起動', exact: true }).click();
  await launch.getByRole('alert').waitFor();
  const runNames = async () =>
    (await editor.get(`/projects/${project.id}/runs?experimentId=${experiment.id}`)).items.map(
      (item) => item.name,
    );
  assert.equal((await runNames()).includes('refused-launch'), false, 'a refused Job left a Run');
  await admin.patch(`/targets/${gpuHost.id}`, { enabled: true });
  await launch.getByRole('button', { name: 'ジョブを起動', exact: true }).click();
  await launch.waitFor({ state: 'hidden' });
  assert.equal((await runNames()).filter((name) => name === 'refused-launch').length, 1);

  console.log('Hooks: a hook is copied into the create dialog with its settings');
  const hook = await editor.post(`/projects/${project.id}/hooks`, {
    name: '手動の評価',
    trigger: 'manual',
    template: {
      experimentId: experiment.id,
      kind: 'training',
      codeVersionId: codeVersion.id,
      targetId: gpuHost.id,
      gpuIds: ['1'],
      parameters: { lr: 0.001 },
    },
  });
  await page.goto(`${projectBase}/hooks?hook=${hook.hook.id}`);
  await page.getByRole('button', { name: '複製して新しく作る', exact: true }).click();
  const copyDialog = page.getByRole('dialog', { name: 'フックを複製して作成' });
  assert.equal(await copyDialog.getByLabel('名前').inputValue(), '手動の評価（複製）');
  assert.match(await copyDialog.getByLabel('パラメータ（JSON）').inputValue(), /"lr": 0.001/);
  await screenshot(page, '06-hook-copy-dialog');
  await copyDialog.getByRole('button', { name: '作成', exact: true }).click();
  await copyDialog.waitFor({ state: 'hidden' });
  const hooks = (await editor.get(`/projects/${project.id}/hooks`)).items;
  const copied = hooks.find((item) => item.name === '手動の評価（複製）');
  assert.deepEqual(copied.template.gpuIds, ['1']);
  assert.deepEqual(copied.template.parameters, { lr: 0.001 });

  console.log('Computer details: opened from a link, they warn before a connection check');
  await admin.page.goto(`${base}/settings/computers?computer=${gpuHost.id}`);
  const summary = admin.page.getByTestId('computer-summary');
  await summary.getByText('workerなし', { exact: true }).waitFor();
  await admin.page
    .getByTestId('target-check-panel')
    .getByText('接続確認を頼んでも5分後に失敗します', { exact: false })
    .waitFor();
  await screenshot(admin.page, '07-computer-details-worker-missing', { fullPage: true });

  console.log('390px: the Jobs details and Compute do not scroll sideways');
  const phone = await signIn(`exec-editor-${runKey}@localhost`, '研究者A', PHONE);
  await phone.page.goto(`${projectBase}/jobs?job=${job.id}`);
  await phone.page.locator('section.job-detail .log-view').waitFor();
  await assertNoSidewaysScroll(phone.page, 'the Job details with its log');
  await screenshot(phone.page, '08-phone-job-detail');
  await phone.page.goto(`${projectBase}/compute`);
  await phone.page.getByText('workerなし', { exact: true }).first().waitFor();
  await assertNoSidewaysScroll(phone.page, 'Compute');
  await screenshot(phone.page, '09-phone-compute', { fullPage: true });

  assert.deepEqual(pageErrors, []);
  console.log('job execution: ok');
} finally {
  await browser.close();
}
