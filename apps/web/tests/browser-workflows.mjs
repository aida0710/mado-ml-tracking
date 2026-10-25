// Workflowsの画面をブラウザで確かめる（PR #20のレビュー）: 開始・再開・停止が確認のあとにだけ動き、
// 素のhttpのページ（crypto.randomUUIDが無い）でも動くこと、応答が失われても確認1回につき実行が
// 1つであること、実行を始めていないviewerとeditorに見えるもの、履歴が表示中の実行を保つこと、
// 古いバージョン、英語の画面、定義のダイアログのEscape・未保存の変更の確認・キーの名前の変更、
// 390pxのダイアログ、実行とRunの詳細、実行が終わると確認のダイアログが閉じること、Jobsの画面から
// ワークフローへ戻る道。
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { createBrowserApi } from './browserApi.mjs';
import { createWorkflowMock } from './workflowMock.mjs';

const modulePath = process.env.MMT_PLAYWRIGHT_MODULE;
if (!modulePath) throw new Error('Set MMT_PLAYWRIGHT_MODULE to an installed Playwright index.mjs');
const { chromium } = await import(pathToFileURL(modulePath).href);
const browser = await chromium.launch({
  headless: true,
  ...(process.env.MMT_CHROMIUM_PATH ? { executablePath: process.env.MMT_CHROMIUM_PATH } : {}),
  args: ['--no-sandbox'],
});
const base = process.env.MMT_WEB_URL ?? 'http://127.0.0.1:5182';
const screenshotDirectory = process.env.MMT_SCREENSHOT_DIR;
const DESKTOP = { width: 1440, height: 900 };
const NARROW = { width: 390, height: 844 };
const SHORT_ID_LENGTH = 8;

/** モックのAPIにログインしたブラウザ。表示言語は`locale`、Projectでのroleは`role`。 */
async function openSession({ locale = 'ja-JP', role = 'admin', viewport = DESKTOP } = {}) {
  const context = await browser.newContext({ locale, viewport });
  // テストのorigin 127.0.0.1は安全なものとして扱われるので、素のhttpのoriginに無いものを取り除く。
  await context.addInitScript(() => {
    delete Crypto.prototype.randomUUID;
  });
  const api = createBrowserApi();
  api.state.loggedIn = true;
  api.state.project.role = role;
  const workflows = createWorkflowMock(api);
  await context.route(
    (url) => url.pathname.startsWith('/api/'),
    async (route) => {
      if (!(await workflows.route(route))) await api.route(route);
    },
  );
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  return { context, page, api, workflows, pageErrors };
}

const workflowPath = (session, executionId) =>
  `${base}/projects/${session.api.state.project.id}/workflows/${session.workflows.state.workflow.id}` +
  (executionId ? `?execution=${executionId}` : '');
const shortId = (id) => id.slice(0, SHORT_ID_LENGTH);

/** ラベルが`option`の、またはそれを含む（実行の短いid）選択肢を選ぶ。 */
async function choose(container, label, option, { exact = true } = {}) {
  await container.getByRole('combobox', { name: label, exact: true }).click();
  await container.getByRole('option', { name: option, exact }).click();
}

async function hasNoHorizontalScroll(page) {
  return page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
}

async function shot(page, name) {
  if (screenshotDirectory) await page.screenshot({ path: `${screenshotDirectory}/${name}.png`, fullPage: true });
}

async function startResumeAndStop() {
  const session = await openSession();
  const { page, workflows } = session;
  const [running, failed] = workflows.state.executions;
  try {
    // ?execution=が無ければ最新の実行を表示し、アドレスに書き込む。
    await page.goto(workflowPath(session));
    await page.waitForURL(`**?execution=${running.id}`);
    await page.locator('.workflow-execution h2 .status-badge', { hasText: '実行中' }).waitFor();

    // 古いバージョンは求めたときに読む。
    const versionChoice = page.getByRole('combobox', { name: 'ワークフローのバージョン', exact: true });
    await versionChoice.click();
    assert.equal(await page.getByRole('option', { name: 'v1', exact: true }).count(), 0);
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: '以前のバージョンを読み込む', exact: true }).click();
    await choose(page, 'ワークフローのバージョン', 'v1');
    assert.equal((await versionChoice.textContent()).trim(), 'v1');
    await choose(page, 'ワークフローのバージョン', 'v25');

    // 履歴のページをめくっても、表示中の実行が選ばれたまま残る。
    const executionChoice = page.getByRole('combobox', { name: '実行', exact: true });
    const shownLabel = (await executionChoice.textContent()).trim();
    assert.ok(shownLabel.includes(shortId(running.id)), shownLabel);
    await page.getByRole('button', { name: '以前の実行', exact: true }).click();
    await page.getByRole('button', { name: '最新の実行', exact: true }).waitFor();
    assert.equal((await executionChoice.textContent()).trim(), shownLabel);
    assert.ok(page.url().endsWith(`?execution=${running.id}`));
    await page.getByRole('button', { name: '最新の実行', exact: true }).click();

    // 開始: 確認より前には何も送らない。応答が失われたあと2回目の確認をすると同じキーを送り、
    // APIが最初に作った実行が表示される。
    await page.getByRole('button', { name: 'ワークフローを実行', exact: true }).click();
    const startDialog = page.getByRole('dialog', { name: 'ワークフローを実行' });
    await startDialog.getByText('バージョン v25 を実行します', { exact: false }).waitFor();
    assert.equal(workflows.state.launches.length, 0, 'a launch was sent before the confirmation');
    workflows.state.loseNextLaunchAnswer = true;
    await startDialog.getByRole('button', { name: '実行する', exact: true }).click();
    await startDialog.getByRole('alert').waitFor();
    await startDialog.getByRole('button', { name: '実行する', exact: true }).click();
    await startDialog.waitFor({ state: 'detached' });
    assert.equal(workflows.state.launches.length, 2);
    const [lost, resent] = workflows.state.launches;
    assert.equal(resent.idempotencyKey, lost.idempotencyKey, 'the resent start got a new key');
    assert.match(lost.idempotencyKey, /^[0-9a-f]{32}$/);
    assert.equal(new Set(workflows.state.launches.map((launched) => launched.executionId)).size, 1);
    const started = workflows.state.executions[0];
    await page.getByRole('status').filter({ hasText: `実行 ${shortId(started.id)}（バージョン v25）を開始しました。` }).waitFor();
    await page.waitForURL(`**?execution=${started.id}`);

    // 新しく確認すれば、新しいキーで新しく開始する。
    await page.getByRole('button', { name: 'ワークフローを実行', exact: true }).click();
    await startDialog.getByRole('button', { name: 'キャンセル', exact: true }).click();
    assert.equal(workflows.state.launches.length, 2);

    // 失敗した実行を再開する: 確認にはその実行とバージョンが出る。
    await choose(page, '実行', shortId(failed.id), { exact: false });
    await page.getByText('成功したステップのRunと出力を再利用し、未完了のステップから再実行します。').waitFor();
    await page.getByRole('button', { name: '新しい実行として再開', exact: true }).click();
    const resumeDialog = page.getByRole('dialog', { name: '新しい実行として再開' });
    await resumeDialog.getByText(`実行 ${shortId(failed.id)}（バージョン v24）を、新しい実行として再開します。`).waitFor();
    await shot(page, 'workflow-resume-confirm');
    await resumeDialog.getByRole('button', { name: '再開する', exact: true }).click();
    await resumeDialog.waitFor({ state: 'detached' });
    const resumed = workflows.state.launches.at(-1);
    assert.equal(resumed.resumeFromExecutionId, failed.id);
    assert.equal(resumed.revision, 24);
    assert.notEqual(resumed.idempotencyKey, lost.idempotencyKey);

    // Project adminとして、同僚の実行（実行中）を止める: 確認に作成者の名前が出る。
    await choose(page, '実行', shortId(running.id), { exact: false });
    await page.getByRole('button', { name: 'ワークフローを停止', exact: true }).click();
    const stopDialog = page.getByRole('dialog', { name: 'ワークフローを停止' });
    await stopDialog.getByText(`作成者: ${workflows.state.colleague.displayName}`, { exact: false }).waitFor();
    await stopDialog.getByText('実行中のJobに停止を依頼し', { exact: false }).waitFor();
    await shot(page, 'workflow-stop-confirm');
    assert.equal(workflows.state.cancels.length, 0);
    await stopDialog.getByRole('button', { name: '停止する', exact: true }).click();
    await stopDialog.waitFor({ state: 'detached' });
    assert.deepEqual(workflows.state.cancels, [running.id]);
    await page.getByRole('status').filter({ hasText: `実行 ${shortId(running.id)} の停止を依頼しました。` }).waitFor();
    await page.locator('.workflow-execution h2 .status-badge', { hasText: '停止要求済み' }).waitFor();
    await shot(page, 'workflow-stop-requested');
    assert.deepEqual(session.pageErrors, []);
    console.log('ok: start, resume and stop ask first, work without crypto.randomUUID and start once per confirmation');
  } finally {
    await session.context.close();
  }
}

async function whatViewersAndOtherEditorsSee() {
  const editor = await openSession({ role: 'editor' });
  try {
    const [running, failed] = editor.workflows.state.executions;
    await editor.page.goto(workflowPath(editor, running.id));
    await editor.page.getByText('停止・再開は、実行の作成者かProject adminだけができます').waitFor();
    assert.equal(await editor.page.getByRole('button', { name: 'ワークフローを停止' }).count(), 0);
    assert.equal(await editor.page.getByRole('button', { name: 'ワークフローを実行' }).count(), 1);
    // 自分の失敗した実行は再開できる。
    await editor.page.goto(workflowPath(editor, failed.id));
    await editor.page.getByRole('button', { name: '新しい実行として再開', exact: true }).waitFor();
    assert.deepEqual(editor.pageErrors, []);
  } finally {
    await editor.context.close();
  }
  const viewer = await openSession({ role: 'viewer' });
  try {
    const [running] = viewer.workflows.state.executions;
    await viewer.page.goto(workflowPath(viewer, running.id));
    await viewer.page.getByRole('heading', { name: '実行履歴', exact: true }).waitFor();
    await viewer.page.locator('.workflow-execution').waitFor();
    for (const name of ['ワークフローを実行', '新しいバージョンを作成', 'ワークフローを停止', '新しい実行として再開'])
      assert.equal(await viewer.page.getByRole('button', { name }).count(), 0, name);
    assert.equal(await viewer.page.getByText('停止・再開は、実行の作成者かProject adminだけができます').count(), 0);
    assert.deepEqual(viewer.pageErrors, []);
  } finally {
    await viewer.context.close();
  }
  console.log('ok: viewers see no controls, editors read why they cannot stop a colleague’s execution');
}

async function englishScreen() {
  const session = await openSession({ locale: 'en-US' });
  const { page, workflows } = session;
  try {
    const [running] = workflows.state.executions;
    await page.goto(workflowPath(session, running.id));
    await page.getByRole('heading', { name: 'Execution history', exact: true }).waitFor();
    await page.locator('.workflow-execution h2 .status-badge', { hasText: 'Running' }).waitFor();
    await page.getByRole('link', { name: 'Open run', exact: true }).first().waitFor();
    await page.getByRole('button', { name: 'Start workflow', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Start workflow' });
    await dialog.getByText(`Starts version v25 of the workflow “${workflows.state.workflow.name}”.`).waitFor();
    await dialog.getByText("Each step's task starts as a job, in order", { exact: false }).waitFor();
    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
    await page.getByRole('button', { name: 'Stop workflow', exact: true }).click();
    await page.getByRole('dialog', { name: 'Stop workflow' }).getByText('Created by:', { exact: false }).waitFor();
    await shot(page, 'workflow-english');
    assert.deepEqual(session.pageErrors, []);
    console.log('ok: the workflow screen and its confirmations are in English');
  } finally {
    await session.context.close();
  }
}

async function definitionDialog() {
  const session = await openSession({ viewport: NARROW });
  const { page } = session;
  try {
    await page.goto(`${base}/projects/${session.api.state.project.id}/workflows`);
    await page.getByRole('button', { name: 'ワークフローを作成', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'ワークフローを作成' });
    const first = dialog.locator('.workflow-step-editor').first();
    await first.getByRole('combobox', { name: 'Task', exact: true }).waitFor();
    assert.ok(await hasNoHorizontalScroll(page), 'the definition dialog scrolls sideways at 390px');
    await shot(page, 'workflow-definition-390');

    // Escapeは開いている一覧だけを閉じ、ダイアログは残る。
    await first.getByRole('combobox', { name: 'Task', exact: true }).click();
    await page.getByRole('listbox').waitFor();
    await page.keyboard.press('Escape');
    await page.getByRole('listbox').waitFor({ state: 'detached' });
    assert.ok(await dialog.isVisible(), 'Escape on the list closed the dialog');

    // ステップを2つ作る。2つ目は1つ目の出力で学習する。
    await dialog.getByLabel('名前', { exact: true }).fill('画面から作った前処理と学習');
    await choose(first, 'Task', '音声の前処理', { exact: false });
    await dialog.getByRole('button', { name: 'ステップを追加', exact: true }).click();
    const second = dialog.locator('.workflow-step-editor').nth(1);
    await choose(second, 'Task', '音声の学習', { exact: false });
    await second.getByRole('button', { name: '入力を追加', exact: true }).click();
    const input = second.locator('.workflow-input');
    await choose(input, '入力元', '前のステップの出力');
    await choose(input, '出力元のステップ', '音声の前処理');

    // 1つ目のステップのキーの名前を変えても、2つ目のステップの出力元はそのまま。
    const key = first.getByLabel('ステップのキー', { exact: true });
    await key.fill('clean');
    await key.blur();
    assert.equal((await input.getByRole('combobox', { name: '出力元のステップ', exact: true }).textContent()).trim(), '音声の前処理');

    // 前のステップが持つキーは使用済みと出て、参照はそのキーの変更に付いていかない。
    const secondKey = second.getByLabel('ステップのキー', { exact: true });
    const originalSecondKey = await secondKey.inputValue();
    await secondKey.fill('clean');
    await secondKey.blur();
    await second.getByText('キー「clean」は前のステップで使われています。別のキーにしてください。').waitFor();
    await secondKey.fill(originalSecondKey);
    await secondKey.blur();
    assert.equal(await second.getByText('前のステップで使われています', { exact: false }).count(), 0);
    assert.equal((await input.getByRole('combobox', { name: '出力元のステップ', exact: true }).textContent()).trim(), '音声の前処理');

    // 断られたときは、ステップと入力と理由を示す。重み0も、ブラウザ自身の入力欄の検査でなく、
    // ここに出る。
    const weight = input.getByLabel('混合比率の重み', { exact: true });
    await weight.fill('0');
    await dialog.getByRole('button', { name: '保存', exact: true }).click();
    await dialog.getByText('ステップ2の入力1: 重みは0より大きい数にしてください。').waitFor();
    await weight.fill('2');
    await input.getByRole('textbox', { name: '抽出条件（JSON）', exact: true }).fill('[1]');
    await dialog.getByRole('button', { name: '保存', exact: true }).click();
    await dialog.getByText('ステップ2の入力1: 抽出条件は、{ } で囲んだ JSON のオブジェクトにしてください（条件が無ければ {}）。').waitFor();

    // 1つ目のステップを削除するときは確認を求め、そのあと2つ目のステップに出力元が無くなったと出る。
    await first.getByRole('button', { name: 'ステップを削除', exact: true }).click();
    const removal = page.getByRole('dialog', { name: 'ステップを削除' });
    // ステップの名前は、そのステップに選んだTaskから付いた。
    await removal.getByText('ステップ「音声の前処理」を削除します', { exact: false }).waitFor();
    await removal.getByRole('button', { name: '削除する', exact: true }).click();
    await dialog.getByText('前のステップ「clean」が見つかりません。選び直してください。').waitFor();

    // 未保存の編集があるときのEscapeは、捨てる前に確かめる。
    await page.keyboard.press('Escape');
    const unsaved = page.getByRole('dialog', { name: '未保存の変更があります' });
    await unsaved.waitFor();
    await unsaved.getByRole('button', { name: '編集を続ける', exact: true }).click();
    assert.ok(await dialog.isVisible());
    await dialog.getByRole('button', { name: 'キャンセル', exact: true }).click();
    await unsaved.getByRole('button', { name: '変更を破棄', exact: true }).click();
    await dialog.waitFor({ state: 'detached' });

    // 保存したワークフローはそのページを開く。未保存の変更の確認が画面の移動を止めることはない。
    await page.getByRole('button', { name: 'ワークフローを作成', exact: true }).click();
    await dialog.getByLabel('名前', { exact: true }).fill('前処理だけ');
    await choose(dialog.locator('.workflow-step-editor').first(), 'Task', '音声の前処理', { exact: false });
    await dialog.getByRole('button', { name: '保存', exact: true }).click();
    await page.waitForURL(`**/workflows/${session.workflows.state.workflow.id}**`);
    assert.equal(await unsaved.count(), 0);
    const [created] = session.workflows.state.created;
    assert.equal(created.steps[0].expectedTaskRevision, 1);
    assert.equal(created.steps[0].inputs[0].source.datasetVersionId, session.api.state.datasetVersions[0].id);
    assert.deepEqual(session.pageErrors, []);
    console.log('ok: the definition dialog fits 390px, keeps edits from Escape and names what to fix');
  } finally {
    await session.context.close();
  }
}

async function runDetailsAndJobs() {
  const session = await openSession({ viewport: NARROW });
  const { page, api, workflows } = session;
  try {
    const run = workflows.state.processingRun;
    await page.goto(`${base}/projects/${api.state.project.id}/runs/${run.id}?tab=details`);
    await page.getByRole('link', { name: 'ワークフローを開く', exact: true }).waitFor();
    await page.getByRole('heading', { name: '前処理レポート', exact: true }).waitFor();
    assert.ok(await hasNoHorizontalScroll(page), 'the Run details scroll sideways at 390px');
    await shot(page, 'run-workflow-context-390');
    // ワークフローに属さないRunでは、詳細の欄に空の区分を出さない。
    await page.goto(`${base}/projects/${api.state.project.id}/runs/${api.state.runs[0].id}?tab=details`);
    await page.locator('.details-grid').waitFor();
    assert.equal(await page.locator('.workflow-run-context').count(), 0);

    // Jobs: ワークフローのステップのJobは、APIが断るretryでなく、その実行へ案内する。古いworkerしか
    // 受け取れない待機中のJobには、workerの更新が要ると出る。
    const [, failed, finished] = workflows.state.executions;
    const job = (fields) => ({
      projectId: api.state.project.id,
      runId: run.id,
      targetId: api.state.targets[0].id,
      gpuIds: [],
      workerId: null,
      leaseId: null,
      cancelRequested: false,
      attempt: 1,
      maxAttempts: 1,
      createdAt: '2026-10-12T00:00:00.000Z',
      startedAt: null,
      endedAt: null,
      heartbeatAt: null,
      exitCode: null,
      error: null,
      heartbeatStale: false,
      phase: null,
      gpuCount: 0,
      walltimeSeconds: null,
      schedulerJobId: null,
      submittedAt: null,
      runnerHost: null,
      arrayGroupId: null,
      arrayIndex: null,
      arraySize: null,
      endReason: null,
      parentJobId: null,
      chainDepth: 0,
      hookId: null,
      allowChildJobs: false,
      retryOnFailure: false,
      retryOnTimeout: false,
      datasetPartitionVersionId: null,
      siteJobShellId: null,
      ...fields,
    });
    api.state.jobs.push(
      job({
        id: '00000000-0000-4000-8000-0000000f0a01',
        status: 'failed',
        workflowExecution: { workflowId: workflows.state.workflow.id, executionId: failed.id },
        requiredWorkerCapabilities: ['workflowDatasetUsage'],
      }),
      job({
        id: '00000000-0000-4000-8000-0000000f0a02',
        status: 'queued',
        workflowExecution: { workflowId: workflows.state.workflow.id, executionId: failed.id },
        requiredWorkerCapabilities: ['workflowDatasetUsage'],
      }),
      job({
        id: '00000000-0000-4000-8000-0000000f0a03',
        status: 'finished',
        workflowExecution: { workflowId: workflows.state.workflow.id, executionId: finished.id },
        requiredWorkerCapabilities: ['workflowDatasetUsage'],
      }),
    );
    api.state.workers = [
      {
        projectId: api.state.project.id,
        tokenId: 'token',
        tokenName: 'worker token',
        workerId: 'old-worker',
        version: null,
        hostname: null,
        targetIds: [api.state.targets[0].id],
        parallelJobs: null,
        startedAt: '2026-10-12T00:00:00.000Z',
        lastSeenAt: new Date().toISOString(),
        status: 'online',
        activeJobCount: 0,
        capabilities: [],
      },
    ];
    await page.setViewportSize(DESKTOP);
    await page.goto(`${base}/projects/${api.state.project.id}/jobs`);
    const resumeLink = page.getByRole('link', { name: 'ワークフローの画面で再開', exact: true });
    await resumeLink.waitFor();
    assert.equal(await page.getByRole('button', { name: '新しいRunで再実行' }).count(), 0);
    assert.ok((await resumeLink.getAttribute('href')).endsWith(`?execution=${failed.id}`));
    // 終わったステップには再開するものが無い。そのJobは実行を開くだけ。
    const openLink = page.getByRole('link', { name: 'ワークフローを開く', exact: true });
    assert.equal(await openLink.count(), 1);
    assert.ok((await openLink.getAttribute('href')).endsWith(`?execution=${finished.id}`));
    await page.goto(`${base}/projects/${api.state.project.id}/jobs?job=00000000-0000-4000-8000-0000000f0a02`);
    await page.getByText('workerを新しいmado-trackingに更新すると受け取ります', { exact: false }).waitFor();
    await page.getByText('ワークフローのステップ（データの用途・重み・抽出条件を実行コードへ渡す）').waitFor();
    await shot(page, 'jobs-workflow-step');
    assert.deepEqual(session.pageErrors, []);
    console.log('ok: Run details fit 390px; Jobs send workflow steps back to their execution (to resume only a failed one) and name an old worker');
  } finally {
    await session.context.close();
  }
}

async function confirmationsFollowTheExecution() {
  const session = await openSession();
  const { page, workflows } = session;
  const [running, , other] = workflows.state.executions;
  // 最初の実行が終わったあとで表示する、実行中のもう1つの実行。
  other.status = 'running';
  try {
    await page.goto(workflowPath(session, running.id));
    await page.getByRole('button', { name: 'ワークフローを停止', exact: true }).click();
    const stopDialog = page.getByRole('dialog', { name: 'ワークフローを停止' });
    await stopDialog.waitFor();
    // 確認を開いている間に実行が失敗する: ページのポーリングが確認を閉じ、失敗した実行には代わりに
    // 再開が出る。
    running.status = 'failed';
    await stopDialog.waitFor({ state: 'detached' });
    await page.getByRole('button', { name: '新しい実行として再開', exact: true }).waitFor();
    // 実行中の別の実行を表示しても、閉じた確認は戻ってこない。
    await choose(page, '実行', shortId(other.id), { exact: false });
    await page.waitForURL(`**?execution=${other.id}`);
    await page.getByRole('button', { name: 'ワークフローを停止', exact: true }).waitFor();
    assert.equal(await stopDialog.count(), 0, 'the stop confirmation came back for another execution');
    assert.deepEqual(workflows.state.cancels, []);
    assert.deepEqual(session.pageErrors, []);
    console.log('ok: a stop confirmation closes when the execution ends and does not come back');
  } finally {
    await session.context.close();
  }
}

async function narrowExecutionDetails() {
  const session = await openSession({ viewport: NARROW });
  const { page, workflows } = session;
  const [running, failed] = workflows.state.executions;
  const resumeHint = '成功したステップのRunと出力を再利用し、未完了のステップから再実行します。';
  try {
    await page.goto(workflowPath(session, running.id));
    await page.locator('.workflow-execution h2 .status-badge', { hasText: '実行中' }).waitFor();
    assert.ok(await hasNoHorizontalScroll(page), 'the execution details scroll sideways at 390px');

    // 履歴から選んだあと、再開の説明がボタンの下に読める形で出る。
    await choose(page, '実行', shortId(failed.id), { exact: false });
    await page.waitForURL(`**?execution=${failed.id}`);
    const resume = page.getByRole('button', { name: '新しい実行として再開', exact: true });
    const hint = page.getByText(resumeHint, { exact: true });
    const buttonBox = await resume.boundingBox();
    const hintBox = await hint.boundingBox();
    assert.ok(hintBox.y >= buttonBox.y + buttonBox.height, 'the resume note is not under its button');
    assert.ok(hintBox.x >= 0 && hintBox.x + hintBox.width <= NARROW.width, 'the resume note leaves the screen');
    const describedBy = await resume.getAttribute('aria-describedby');
    assert.equal((await page.locator(`[id="${describedBy}"]`).textContent()).trim(), resumeHint);
    assert.ok(await hasNoHorizontalScroll(page), 'the failed execution scrolls sideways at 390px');
    await shot(page, 'workflow-execution-390');

    // 再開し、続けて新しい実行を止める。どちらも何が起きたかを示し、390pxに収まる。
    await resume.click();
    const resumeDialog = page.getByRole('dialog', { name: '新しい実行として再開' });
    await resumeDialog.getByRole('button', { name: '再開する', exact: true }).click();
    await resumeDialog.waitFor({ state: 'detached' });
    const resumed = workflows.state.executions[0];
    await page.getByRole('status').filter({ hasText: `実行 ${shortId(resumed.id)}（バージョン v24）を開始しました。` }).waitFor();
    await page.waitForURL(`**?execution=${resumed.id}`);
    assert.ok(await hasNoHorizontalScroll(page), 'the resumed execution scrolls sideways at 390px');
    await shot(page, 'workflow-resumed-390');
    await page.getByRole('button', { name: 'ワークフローを停止', exact: true }).click();
    const stopDialog = page.getByRole('dialog', { name: 'ワークフローを停止' });
    await stopDialog.getByRole('button', { name: '停止する', exact: true }).click();
    await stopDialog.waitFor({ state: 'detached' });
    await page.getByRole('status').filter({ hasText: `実行 ${shortId(resumed.id)} の停止を依頼しました。` }).waitFor();
    assert.ok(await hasNoHorizontalScroll(page), 'the stopped execution scrolls sideways at 390px');
    await shot(page, 'workflow-stop-requested-390');
    assert.deepEqual(session.pageErrors, []);
    console.log('ok: at 390px the history choice, resume and stop fit, and the resume note reads under its button');
  } finally {
    await session.context.close();
  }
}

// 1つの確認が失敗しても後の確認を実行し、1回の実行で壊れた動きをすべて知らせる。
const failedChecks = [];
try {
  for (const check of [
    startResumeAndStop,
    whatViewersAndOtherEditorsSee,
    englishScreen,
    definitionDialog,
    runDetailsAndJobs,
    confirmationsFollowTheExecution,
    narrowExecutionDetails,
  ]) {
    try {
      await check();
    } catch (error) {
      failedChecks.push(check.name);
      console.error(`failed: ${check.name}: ${String(error.message).split('\n')[0]}`);
    }
  }
} finally {
  await browser.close();
}
assert.deepEqual(failedChecks, []);
