// 2026-10-11の使いやすさの監査の3段目で直したモデルの画面のブラウザでの確認（audit/b-models.mdの
// 5〜12）。分離したモックのAPI（tests/browserApi.mjs）を相手にする。Ctrlを押しながらクリックする
// 一覧の代わりのチェックボックス、ほかのルールの設定から作るルール、確認の後で失敗させずに有効化を
// 勧める無効のルール、最初のページより先まで読め、ルールで絞り込める自動実行の履歴（ルールを
// 変えると最新のページへ戻る）、1440pxのウィンドウの中に操作を収める表、選んだモデルまで
// スクロールするスマートフォンの画面、バージョンのフォームを開かずに読めるコードバージョンのファイル。
// 先にMMT_WEB_URLでViteを起動しておく。MMT_SCREENSHOT_DIRを設定すると、そこにスクリーンショットを保存する。
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { createBrowserApi } from './browserApi.mjs';

const modulePath = process.env.MMT_PLAYWRIGHT_MODULE;
if (!modulePath) throw new Error('Set MMT_PLAYWRIGHT_MODULE to an installed Playwright index.mjs');
const { chromium } = await import(pathToFileURL(modulePath).href);
const base = process.env.MMT_WEB_URL ?? 'http://127.0.0.1:5182';
const screenshotDirectory = process.env.MMT_SCREENSHOT_DIR;
if (screenshotDirectory) await mkdir(screenshotDirectory, { recursive: true });
const WIDE = { width: 1440, height: 900 };
const NARROW = { width: 390, height: 844 };
// 履歴の最初のページ（AUTOMATION_HISTORY_PAGE_SIZE = 100）より多い件数。
const INFERENCE_EXECUTION_COUNT = 105;
const EVALUATION_EXECUTION_COUNT = 3;
// スマートフォンで詳細が一覧より下へ押し出されるだけの数のモデル。
const EXTRA_MODEL_COUNT = 12;

/**
 * 共通のモックのAPIに、3つのルール（登録時の推論、その後の評価、無効のルール）、1ページより
 * 多い実行、多数のモデル、Service Accountが所有する長い条件の昇格policyを足したもの。
 */
function createAutomationApi() {
  const api = createBrowserApi();
  api.state.loggedIn = true;
  const { state } = api;
  const { project, user } = state;
  let sequence = 700;
  const id = () => `00000000-0000-4000-8000-${String(sequence++).padStart(12, '0')}`;
  const [model] = state.models;
  const [modelVersion] = state.modelVersions;
  const [codeVersion] = state.codeVersions;
  codeVersion.source = {
    kind: 'inline',
    files: { 'main.py': 'print("infer")\n', 'lib/util.py': 'def helper():\n    return 1\n' },
  };
  codeVersion.taskTypes = ['inference', 'evaluation'];
  const ruleBase = {
    projectId: project.id,
    enabled: true,
    trigger: 'model_registered',
    upstreamRuleId: null,
    modelFamilies: [model.family],
    kind: 'inference',
    experimentId: state.experiments[0].id,
    codeVersionId: codeVersion.id,
    targetId: state.targets[0].id,
    gpuIds: ['1'],
    inputDatasetVersionIds: [state.datasetVersions[0].id],
    parameters: { temperature: 0 },
    tags: { suite: 'nightly' },
    maxAttempts: 2,
    summaryMetrics: [],
    createdBy: user.id,
    createdByName: user.displayName,
    runAsUserId: user.id,
    runAsKind: 'human',
    runAsName: user.displayName,
    createdAt: '2026-10-10T00:00:00Z',
  };
  const inferRule = { ...ruleBase, id: id(), name: '登録時に推論' };
  const evaluateRule = {
    ...ruleBase,
    id: id(),
    name: '推論のあとに評価',
    trigger: 'upstream_run_finished',
    upstreamRuleId: inferRule.id,
    kind: 'evaluation',
  };
  const disabledRule = { ...ruleBase, id: id(), name: '止めてある推論', enabled: false };
  state.automationRules.push(inferRule, evaluateRule, disabledRule);
  const execution = (rule, index) => ({
    id: id(),
    projectId: project.id,
    ruleId: rule.id,
    modelVersionId: modelVersion.id,
    runId: null,
    jobId: null,
    status: 'failed',
    error: index === 0 ? 'Target disabled' : null,
    createdAt: new Date(Date.UTC(2026, 9, 11, 0, 0, index)).toISOString(),
    sourceRunId: null,
    runStatus: null,
    jobStatus: null,
    runStartedAt: null,
    runEndedAt: null,
    triggerRunId: null,
    pipelineRootExecutionId: null,
    attempt: 1,
    source: 'automatic',
    requestedBy: null,
    retryOfExecutionId: null,
  });
  for (let index = 0; index < INFERENCE_EXECUTION_COUNT; index++)
    state.automationExecutions.push(execution(inferRule, index));
  for (let index = 0; index < EVALUATION_EXECUTION_COUNT; index++)
    state.automationExecutions.push(execution(evaluateRule, INFERENCE_EXECUTION_COUNT + index));
  for (let index = 0; index < EXTRA_MODEL_COUNT; index++)
    state.models.push({ ...model, id: id(), name: `short-model-${index + 1}`, aliases: {} });
  const policy = {
    id: id(),
    projectId: project.id,
    name: 'productionへの昇格基準（WER・CER・話者類似度・音声長の一致率の4条件）',
    enabled: false,
    modelId: model.id,
    targetAlias: 'production',
    baselineAlias: 'production',
    evaluationRuleId: evaluateRule.id,
    criteria: [
      { metric: 'evaluation.word_error_rate_on_japanese_test_set', direction: 'lower', mode: 'relative_delta', threshold: -0.05 },
      { metric: 'evaluation.character_error_rate', direction: 'lower', mode: 'delta', threshold: 0 },
      { metric: 'evaluation.speaker_similarity_cosine', direction: 'higher', mode: 'absolute', threshold: 0.8 },
      { metric: 'evaluation.duration_match_rate', direction: 'higher', mode: 'absolute', threshold: 0.99 },
    ],
    missingBaseline: 'pass',
    autoPromote: false,
    createdBy: user.id,
    runAsUserId: id(),
    runAsKind: 'service',
    runAsName: 'promotion-bot',
    createdAt: '2026-10-10T00:00:00Z',
  };
  const ruleSaves = [];
  const ruleToggles = [];
  const executionQueries = [];
  // この先でAPIに断らせる有効化・無効化の要求の数。保存に失敗したときと同じ応答を返す。
  let refusedRuleToggles = 0;
  async function route(route) {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname.replace(/^\/api/, '');
    const method = request.method();
    const projectPath = `/projects/${project.id}`;
    const reply = (payload, status = 200) =>
      route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(payload) });
    if (path === `${projectPath}/automation-executions`) executionQueries.push(url.searchParams);
    if (path === `${projectPath}/automation-rules` && method === 'POST')
      ruleSaves.push(request.postDataJSON());
    const toggle = path.match(/^\/projects\/[^/]+\/automation-rules\/([^/]+)$/);
    if (toggle && method === 'PATCH') {
      ruleToggles.push({ id: toggle[1], ...request.postDataJSON() });
      if (refusedRuleToggles > 0) {
        refusedRuleToggles -= 1;
        return reply({ error: 'failed to process the request', code: 'internal_error' }, 503);
      }
    }
    if (path === `${projectPath}/promotion-policies` && method === 'GET') return reply({ items: [policy] });
    if (path === `${projectPath}/tasks` && method === 'GET') return reply({ items: [] });
    return api.route(route);
  }
  return {
    api,
    route,
    model,
    codeVersion,
    inferRule,
    evaluateRule,
    disabledRule,
    ruleSaves,
    ruleToggles,
    executionQueries,
    refuseNextRuleToggle: () => {
      refusedRuleToggles += 1;
    },
  };
}

const browser = await chromium.launch({
  headless: true,
  args: ['--no-sandbox'],
  ...(process.env.MMT_CHROMIUM_PATH ? { executablePath: process.env.MMT_CHROMIUM_PATH } : {}),
});
const pageErrors = [];
async function openPage({ automation, viewport }) {
  const context = await browser.newContext({ viewport, locale: 'ja-JP' });
  await context.route((url) => url.pathname.startsWith('/api/'), automation.route);
  const page = await context.newPage();
  page.on('pageerror', (error) => pageErrors.push(error.message));
  const screenshot = async (name, options = {}) => {
    if (screenshotDirectory)
      await page.screenshot({ path: `${screenshotDirectory}/${name}.png`, ...options });
  };
  return { context, page, screenshot };
}
async function openModelsTab(page, { projectId, tab }) {
  await page.goto(`${base}/projects/${projectId}/models`);
  await page.getByRole('heading', { name: 'Models', exact: true }).waitFor();
  await page.getByRole('tab', { name: tab, exact: true }).click();
}
/** 表の最後の見出しのセルが、表のスクロール枠の中で終わる（右端が切れない）。 */
async function assertLastColumnVisible(page, table, header) {
  const frame = await table.locator('xpath=ancestor::div[contains(@class,"table-scroll")][1]').boundingBox();
  const cell = await table.getByRole('columnheader', { name: header, exact: true }).boundingBox();
  assert.ok(cell && frame, `${header} is shown`);
  assert.ok(cell.x + cell.width <= frame.x + frame.width + 1, `${header} ends inside the table frame`);
  assert.equal(
    await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth),
    0,
    'the page itself does not scroll sideways',
  );
}

try {
  for (const viewport of [WIDE, NARROW]) {
    const suffix = viewport === WIDE ? 'desktop' : 'mobile';
    const projectOf = (automation) => automation.api.state.project.id;

    console.log(`Rules (${suffix}): several values are checkboxes, not a Ctrl-click list`);
    {
      const automation = createAutomationApi();
      const { page, context, screenshot } = await openPage({ automation, viewport });
      await openModelsTab(page, { projectId: projectOf(automation), tab: '自動実行ルール' });
      await page.getByRole('button', { name: '自動実行ルールを作成', exact: true }).click();
      const dialog = page.getByRole('dialog', { name: '自動実行ルールを作成' });
      await dialog.getByRole('group', { name: /対象モデル系列/ }).waitFor();
      assert.equal(await dialog.locator('select[multiple]').count(), 0);
      await dialog.getByRole('group', { name: /対象モデル系列/ }).getByRole('checkbox').first().check();
      await dialog.getByLabel('実行種別').selectOption('processing');
      // データ処理を実行できるコードバージョンが無い。空の一覧は理由と作る場所を示す。
      await dialog.getByText('実行種別「データ処理」に対応するコードバージョンがありません', { exact: false }).waitFor();
      await dialog.getByRole('link', { name: 'Codeを開く', exact: true }).waitFor();
      await screenshot(`01-rule-create-checkboxes-${suffix}`, { fullPage: true });
      await context.close();
    }

    console.log(`Rules (${suffix}): a rule is made from another one's settings, which can be disabled`);
    {
      const automation = createAutomationApi();
      const { inferRule, evaluateRule } = automation;
      const { page, context, screenshot } = await openPage({ automation, viewport });
      await openModelsTab(page, { projectId: projectOf(automation), tab: '自動実行ルール' });
      await page.getByRole('button', { name: inferRule.name, exact: true }).first().click();
      const detail = page.locator('.automation-rule-detail');
      // このルールの後に続くルールが並び、開くことができる。
      await detail.getByRole('button', { name: evaluateRule.name, exact: true }).waitFor();
      await detail.getByRole('button', { name: '複製して新しく作る', exact: true }).click();
      const dialog = page.getByRole('dialog', { name: `「${inferRule.name}」を複製して作成` });
      await dialog.getByLabel('名前').waitFor();
      assert.equal(await dialog.getByLabel('名前').inputValue(), `${inferRule.name}（複製）`);
      const disableSource = dialog.getByRole('checkbox', { name: `作成したら「${inferRule.name}」を無効にする` });
      assert.equal(await disableSource.isChecked(), true);
      // 元のルールを無効にすると、後に続くルールも止まる。ダイアログがそう伝える。
      await dialog.getByText(`「${evaluateRule.name}」は［上流rule］に元のルールを選んでいます`, { exact: false }).waitFor();
      await screenshot(`02-rule-copy-dialog-${suffix}`, { fullPage: true });
      await dialog.getByLabel('名前').fill('登録時に推論（v2のコード）');
      await dialog.getByRole('button', { name: '作成', exact: true }).click();
      await dialog.waitFor({ state: 'detached' });
      assert.equal(automation.ruleSaves.length, 1);
      const { name, enabled, ...settings } = automation.ruleSaves[0];
      assert.deepEqual({ name, enabled }, { name: '登録時に推論（v2のコード）', enabled: true });
      assert.deepEqual(settings, {
        trigger: inferRule.trigger,
        upstreamRuleId: null,
        modelFamilies: inferRule.modelFamilies,
        kind: inferRule.kind,
        experimentId: inferRule.experimentId,
        codeVersionId: inferRule.codeVersionId,
        targetId: inferRule.targetId,
        gpuIds: inferRule.gpuIds,
        inputDatasetVersionIds: inferRule.inputDatasetVersionIds,
        parameters: inferRule.parameters,
        tags: inferRule.tags,
        maxAttempts: inferRule.maxAttempts,
      });
      await page.waitForFunction(() => document.body.innerText.includes('登録時に推論（v2のコード）'));
      assert.deepEqual(automation.ruleToggles, [{ id: inferRule.id, enabled: false }]);
      await context.close();
    }

    console.log(`Rules (${suffix}): a copy whose source could not be disabled says both rules run`);
    {
      const automation = createAutomationApi();
      const { inferRule } = automation;
      automation.refuseNextRuleToggle();
      const { page, context, screenshot } = await openPage({ automation, viewport });
      await openModelsTab(page, { projectId: projectOf(automation), tab: '自動実行ルール' });
      await page.getByRole('button', { name: inferRule.name, exact: true }).first().click();
      await page.locator('.automation-rule-detail').getByRole('button', { name: '複製して新しく作る', exact: true }).click();
      const dialog = page.getByRole('dialog', { name: `「${inferRule.name}」を複製して作成` });
      await dialog.getByLabel('名前').fill('登録時に推論（v2のコード）');
      await dialog.getByRole('button', { name: '作成', exact: true }).click();
      await dialog.waitFor({ state: 'detached' });
      await page
        .getByRole('alert')
        .filter({ hasText: `「登録時に推論（v2のコード）」は作成しましたが、元の「${inferRule.name}」を無効にできませんでした。` })
        .waitFor();
      // 有効のまま残ったルールを表示するので、利用者はここから止められる。
      await page.locator('.automation-rule-detail').getByRole('heading', { name: inferRule.name, exact: true }).waitFor();
      assert.deepEqual(automation.ruleToggles, [{ id: inferRule.id, enabled: false }]);
      await screenshot(`03-rule-copy-source-left-enabled-${suffix}`, { fullPage: true });
      if (viewport === WIDE) {
        // 知らせのとおりに無効にすると、知らせは消える（スマートフォンではボタンが行の中にある）。
        await page.getByRole('button', { name: `${inferRule.name}: 無効にする`, exact: true }).click();
        await page.getByRole('alert').filter({ hasText: 'を無効にできませんでした' }).waitFor({ state: 'detached' });
      }
      await context.close();
    }

    console.log(`Rules (${suffix}): a disabled rule offers enabling instead of an apply that fails`);
    {
      const automation = createAutomationApi();
      const { disabledRule } = automation;
      const { page, context, screenshot } = await openPage({ automation, viewport });
      await openModelsTab(page, { projectId: projectOf(automation), tab: '自動実行ルール' });
      await page.getByRole('button', { name: disabledRule.name, exact: true }).first().click();
      const detail = page.locator('.automation-rule-detail');
      await detail.getByText('このルールは無効です。有効にすると、既存のバージョンに適用できます。', { exact: true }).waitFor();
      assert.equal(await detail.getByLabel('適用するバージョン').count(), 0);
      await screenshot(`03-rule-disabled-${suffix}`, { fullPage: true });
      await detail.getByRole('button', { name: '有効にする', exact: true }).click();
      await detail.getByLabel('適用するバージョン').waitFor();
      assert.deepEqual(automation.ruleToggles, [{ id: disabledRule.id, enabled: true }]);
      await context.close();
    }

    console.log(`History (${suffix}): older executions load on demand and a rule narrows the list`);
    {
      const automation = createAutomationApi();
      const { evaluateRule } = automation;
      const { page, context, screenshot } = await openPage({ automation, viewport });
      await openModelsTab(page, { projectId: projectOf(automation), tab: '自動実行ルール' });
      await page.getByRole('button', { name: evaluateRule.name, exact: true }).first().click();
      await page.getByRole('button', { name: 'このルールの実行履歴を見る', exact: true }).click();
      await page.getByRole('tab', { name: '自動実行履歴', selected: true }).waitFor();
      const rows = page.locator('.automation-panel table.responsive-table > tbody > tr:not(.responsive-table-details)');
      await page.waitForFunction(
        (count) => document.querySelectorAll('.automation-panel table.responsive-table > tbody > tr:not(.responsive-table-details)').length === count,
        EVALUATION_EXECUTION_COUNT,
      );
      assert.equal(await page.getByLabel('ルール').inputValue(), evaluateRule.id);
      assert.equal(automation.executionQueries.at(-1).get('ruleId'), evaluateRule.id);
      await page.getByLabel('ルール').selectOption('');
      await page.getByText('新しい順に100件を表示しています。', { exact: true }).waitFor();
      assert.equal(await rows.count(), 100);
      if (viewport === WIDE) {
        // 再実行の列は最後の列で、1440pxでは枠の中で終わる。
        await assertLastColumnVisible(page, page.locator('.automation-panel table.responsive-table'), '再実行');
      }
      await screenshot(`04-history-first-page-${suffix}`);
      await page.getByRole('button', { name: 'さらに表示', exact: true }).click();
      await page.waitForFunction(
        (count) => document.querySelectorAll('.automation-panel table.responsive-table > tbody > tr:not(.responsive-table-details)').length === count,
        INFERENCE_EXECUTION_COUNT + EVALUATION_EXECUTION_COUNT,
      );
      assert.equal(await page.getByRole('button', { name: 'さらに表示', exact: true }).count(), 0);
      // 別のルールに切り替えて戻ると、離れたときの一覧ではなく、改めて最新のページを出す。
      await page.getByLabel('ルール').selectOption(evaluateRule.id);
      await page.waitForFunction(
        (count) => document.querySelectorAll('.automation-panel table.responsive-table > tbody > tr:not(.responsive-table-details)').length === count,
        EVALUATION_EXECUTION_COUNT,
      );
      await page.getByLabel('ルール').selectOption('');
      await page.getByText('新しい順に100件を表示しています。', { exact: true }).waitFor();
      assert.equal(await rows.count(), 100);
      await page.getByRole('button', { name: 'さらに表示', exact: true }).waitFor();
      if (viewport === NARROW) {
        // スマートフォンの閉じた行にもバージョンの名前が出るので、行を見分けられる。
        await rows.first().getByRole('link', { name: /UI検証モデル/ }).waitFor();
      }
      await context.close();
    }

    console.log(`Promotion policies (${suffix}): the actions stay inside the window, owners by name`);
    {
      const automation = createAutomationApi();
      const { page, context, screenshot } = await openPage({ automation, viewport });
      await openModelsTab(page, { projectId: projectOf(automation), tab: '昇格ポリシー' });
      const table = page.locator('.automation-panel table.responsive-table').first();
      if (viewport === WIDE) {
        await table.getByRole('button', { name: /所有者を移管/ }).waitFor();
        await table.getByText('promotion-bot（Service Account）', { exact: true }).waitFor();
        await assertLastColumnVisible(page, table, '操作');
        const transfer = await table.getByRole('button', { name: /所有者を移管/ }).boundingBox();
        assert.ok(transfer.x + transfer.width <= WIDE.width, 'the transfer button is inside the window');
        // 長い条件は、行を開いて読む。
        await table.getByRole('button', { name: '詳細を表示' }).first().click();
        await table.getByText('evaluation.duration_match_rate ≥ 0.99', { exact: false }).waitFor();
      } else {
        await table.getByRole('button', { name: '詳細を表示' }).first().click();
        await table.getByText('promotion-bot（Service Account）', { exact: true }).waitFor();
      }
      await screenshot(`05-promotion-policies-${suffix}`, { fullPage: true });
      await context.close();
    }

    console.log(`Code (${suffix}): a version's files are read in a read-only viewer`);
    {
      const automation = createAutomationApi();
      const { codeVersion } = automation;
      const { page, context, screenshot } = await openPage({ automation, viewport });
      await page.goto(`${base}/projects/${projectOf(automation)}/codes?version=${codeVersion.id}`);
      const viewer = page.getByTestId('code-files-viewer');
      await viewer.waitFor();
      await viewer.getByRole('button', { name: 'ファイル: lib/util.py' }).click();
      await viewer.locator('.editor-file-header', { hasText: 'lib/util.py' }).waitFor();
      await viewer.getByText('def helper():', { exact: false }).waitFor();
      // ソースは\nを含むJSONの文字列としては出なくなり、画面はMonaco editorを読み込まない。
      assert.equal(await page.getByText('"kind": "inline"', { exact: false }).count(), 0);
      assert.equal(await page.locator('.monaco-editor').count(), 0);
      // バージョンをどこで実行できるかが一緒に並ぶ。
      await page.getByRole('heading', { name: 'このコードバージョンの使われ方', exact: true }).waitFor();
      await screenshot(`06-code-files-${suffix}`, { fullPage: true });
      await context.close();
    }

    if (viewport === NARROW) {
      console.log('Models (mobile): choosing a model scrolls its detail into view');
      const automation = createAutomationApi();
      const { page, context, screenshot } = await openPage({ automation, viewport });
      await page.goto(`${base}/projects/${projectOf(automation)}/models`);
      const last = `short-model-${EXTRA_MODEL_COUNT}`;
      await page.getByRole('button', { name: last, exact: true }).click();
      const heading = page.getByRole('heading', { name: last, level: 2 });
      await heading.waitFor();
      await page.waitForFunction(
        (name) => {
          const element = [...document.querySelectorAll('h2')].find((item) => item.textContent === name);
          const box = element?.getBoundingClientRect();
          return box && box.top >= 0 && box.bottom <= window.innerHeight;
        },
        last,
      );
      await screenshot('07-model-detail-after-tap-mobile');
      await context.close();
    }
  }
  assert.deepEqual(pageErrors, []);
  console.log('Model automation browser checks passed');
} finally {
  await browser.close();
}
