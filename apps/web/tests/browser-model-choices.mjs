// Browser check of the model screens that offer values instead of having them typed (fix plan
// 2026-10-11, 2段目 B-2〜B-4), against the isolated mock API (tests/browserApi.mjs): a model
// version's weights picked from its training Run (pasted as artifact://, or uploaded without saving
// the version), the model family with candidates and a letter-case warning, why a Task offers no
// code version, the default code version by name, and alias and metric names offered in the
// promotion dialogs.
// Start Vite on MMT_WEB_URL first; MMT_SCREENSHOT_DIR, when set, receives the screenshots.
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
const now = '2026-10-11T00:00:00Z';
const RECORDED_METRICS = ['evaluation.duration_match_rate', 'evaluation.wer'];

/**
 * The shared mock API with what these screens need on top: families qwen3 and qwen2 (a code
 * version lists `Qwen2`, a letter-case slip), a training Run's weights and an upload without a
 * Run, an evaluation rule whose Runs recorded two metrics, and the saves of models, versions and
 * promotion policies.
 */
function createChoicesApi() {
  const api = createBrowserApi();
  api.state.loggedIn = true;
  const { state } = api;
  const { project, user } = state;
  let sequence = 900;
  const id = () => `00000000-0000-4000-8000-${String(sequence++).padStart(12, '0')}`;
  const [model] = state.models;
  const [modelVersion] = state.modelVersions;
  const [codeVersion] = state.codeVersions;
  const [trainingRun] = state.runs;
  Object.assign(model, { family: 'qwen3', nextVersion: '2', aliases: { production: modelVersion.id } });
  modelVersion.family = 'qwen3';
  codeVersion.supportedModelFamilies = ['qwen3'];
  const qwen2Model = {
    ...model,
    id: id(),
    name: 'UI検証モデル（Qwen2）',
    family: 'qwen2',
    latestVersion: 'v1',
    nextVersion: '2',
    aliases: {},
  };
  state.models.push(qwen2Model);
  state.modelVersions.push({ ...modelVersion, id: id(), modelId: qwen2Model.id, family: 'qwen2' });
  // Lists `Qwen2` where the Model says `qwen2`: the slip the Task screen explains.
  state.codeVersions.push({
    ...codeVersion,
    id: id(),
    version: 'v2',
    supportedModelFamilies: ['Qwen2'],
    taskTypes: ['inference'],
  });
  const artifact = (fields) => ({
    ...state.artifacts[0],
    id: id(),
    mimeType: 'application/octet-stream',
    size: 524288000,
    createdAt: now,
    ...fields,
  });
  const runWeights = artifact({ runId: trainingRun.id, path: 'checkpoints/model.safetensors' });
  const uploadedWeights = artifact({ runId: null, path: 'uploads/weights-manual.bin' });
  state.artifacts.push(runWeights, uploadedWeights);
  const evaluationRule = {
    id: id(),
    projectId: project.id,
    name: 'UI評価ルール',
    enabled: true,
    modelFamilies: ['qwen3'],
    kind: 'evaluation',
    trigger: 'model_registered',
    upstreamRuleId: null,
    experimentId: state.experiments[0].id,
    codeVersionId: codeVersion.id,
    targetId: state.targets[0].id,
    gpuIds: [],
    inputDatasetVersionIds: [state.datasetVersions[0].id],
    parameters: {},
    tags: {},
    maxAttempts: 3,
    summaryMetrics: [],
    createdBy: user.id,
    runAsUserId: user.id,
    createdAt: now,
  };
  state.automationRules.push(evaluationRule);
  const policies = [];
  const versionSaves = [];
  const modelSaves = [];
  // A check may set `gate` to hold each file upload (PUT …/artifacts) and look at the form meanwhile.
  const heldUploads = { gate: null };
  async function route(route) {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname.replace(/^\/api/, '');
    const method = request.method();
    const reply = (payload, status = 200) =>
      route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(payload) });
    const notFound = (entity) => reply({ error: `${entity}が見つかりません`, code: 'not_found' }, 404);
    const projectPath = `/projects/${project.id}`;
    if (path === `${projectPath}/artifacts` && method === 'PUT') await heldUploads.gate;
    // The shared mock answers the families and the code versions by name; the rule's metric keys
    // are this check's own, with no evaluation Runs added to the lists the other checks read.
    const metricKeysMatch = path.match(/^\/projects\/[^/]+\/automation-rules\/([^/]+)\/metric-keys$/);
    if (metricKeysMatch && method === 'GET')
      return reply({ items: RECORDED_METRICS, source: 'rule_runs' });
    const artifactMatch = path.match(/^\/projects\/[^/]+\/artifacts\/([^/]+)$/);
    if (artifactMatch && method === 'GET' && !state.artifacts.some((item) => item.id === artifactMatch[1]))
      return notFound('Artifact');
    if (path === `${projectPath}/models` && method === 'POST') {
      const body = request.postDataJSON();
      modelSaves.push(body);
      const created = { ...model, id: id(), ...body, latestVersion: null, nextVersion: '1', aliases: {} };
      state.models.push(created);
      return reply(created, 201);
    }
    const versionsMatch = path.match(/^\/projects\/[^/]+\/models\/([^/]+)\/versions$/);
    if (versionsMatch && method === 'POST') {
      const body = request.postDataJSON();
      versionSaves.push(body);
      const parent = state.models.find((item) => item.id === versionsMatch[1]);
      const version = body.version ?? parent.nextVersion;
      parent.nextVersion = String(Number(parent.nextVersion) + 1);
      parent.latestVersion = version;
      const created = {
        ...modelVersion,
        id: id(),
        modelId: parent.id,
        family: parent.family,
        sourceRunId: null,
        weightsUri: null,
        artifactId: null,
        defaultCodeVersionId: null,
        parentModelVersionIds: [],
        ...body,
        version,
        createdAt: now,
      };
      state.modelVersions.push(created);
      return reply(created, 201);
    }
    // The Tasks page lists Tasks; these checks start from none.
    if (path === `${projectPath}/tasks` && method === 'GET') return reply({ items: [] });
    if (path === `${projectPath}/promotion-policies` && method === 'GET') return reply({ items: policies });
    if (path === `${projectPath}/promotion-policies` && method === 'POST') {
      const created = {
        id: id(),
        projectId: project.id,
        enabled: true,
        createdBy: user.id,
        runAsUserId: user.id,
        createdAt: now,
        ...request.postDataJSON(),
      };
      policies.push(created);
      return reply(created, 201);
    }
    return api.route(route);
  }
  return {
    api,
    route,
    model,
    qwen2Model,
    trainingRun,
    runWeights,
    uploadedWeights,
    evaluationRule,
    codeVersion,
    policies,
    versionSaves,
    modelSaves,
    heldUploads,
  };
}

const browser = await chromium.launch({
  headless: true,
  args: ['--no-sandbox'],
  ...(process.env.MMT_CHROMIUM_PATH ? { executablePath: process.env.MMT_CHROMIUM_PATH } : {}),
});
const pageErrors = [];
async function openPage({ choices, viewport = WIDE }) {
  const context = await browser.newContext({ viewport, locale: 'ja-JP' });
  await context.route((url) => url.pathname.startsWith('/api/'), choices.route);
  const page = await context.newPage();
  page.on('pageerror', (error) => pageErrors.push(error.message));
  const screenshot = async (name, options = {}) => {
    if (screenshotDirectory)
      await page.screenshot({ path: `${screenshotDirectory}/${name}.png`, ...options });
  };
  return { context, page, screenshot };
}

try {
  for (const viewport of [WIDE, NARROW]) {
    const suffix = viewport === WIDE ? 'desktop' : 'mobile';
    console.log(`Model version (${suffix}): the weights come from the chosen training Run's Artifacts`);
    const choices = createChoicesApi();
    const { api, model } = choices;
    const { context, page, screenshot } = await openPage({ choices, viewport });
    await page.goto(`${base}/projects/${api.state.project.id}/models?id=${model.id}`);
    await page.getByRole('button', { name: 'バージョンを作成', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: `${model.name} · バージョンを作成` });
    await dialog.getByText('空欄なら 2 を付けます。', { exact: true }).waitFor();
    const runSelect = dialog.getByRole('combobox', { name: '生成元Run' });
    await runSelect.locator('option', { hasText: 'training-test-01' }).waitFor({ state: 'attached' });
    // The source Runs are searched by kind (the catalog's own search lists every kind).
    assert.ok(
      api.state.calls.some(
        (call) =>
          call.path.endsWith('/runs/search') &&
          JSON.stringify(call.body.kinds) === JSON.stringify(['training', 'finetuning']),
      ),
    );
    await runSelect.selectOption(choices.trainingRun.id);
    const weights = dialog.getByRole('searchbox', { name: '重みのArtifact' });
    await dialog.getByText('生成元RunのArtifactを表示しています', { exact: false }).waitFor();
    const runWeightsButton = dialog.getByRole('button', { name: /checkpoints\/model\.safetensors/ });
    await runWeightsButton.waitFor();
    // Only the chosen Run's files are offered, not the upload without a Run.
    assert.equal(await dialog.getByRole('button', { name: /weights-manual\.bin/ }).count(), 0);
    await weights.scrollIntoViewIfNeeded();
    await screenshot(`01-version-weights-from-run-${suffix}`);
    await runWeightsButton.click();
    await dialog.getByRole('button', { name: '選び直す', exact: true }).waitFor();
    await screenshot(`02-version-weights-picked-${suffix}`);
    await dialog.getByRole('button', { name: '保存', exact: true }).click();
    await dialog.waitFor({ state: 'detached' });
    assert.deepEqual(choices.versionSaves.at(-1), {
      parentModelVersionIds: [],
      sourceRunId: choices.trainingRun.id,
      artifactId: choices.runWeights.id,
      metadata: {},
    });
    await page.getByRole('link', { name: '2', exact: true }).waitFor();
    await context.close();
  }

  for (const viewport of [WIDE, NARROW]) {
    const suffix = viewport === WIDE ? 'desktop' : 'mobile';
    // The upload dialog once sat inside the version form, so its submit and its × also submitted
    // the form and saved an immutable version without weights. Nothing may be saved before 保存.
    console.log(`Model version (${suffix}): uploading the weights from the form saves no version`);
    const choices = createChoicesApi();
    const { api, model } = choices;
    const { context, page, screenshot } = await openPage({ choices, viewport });
    await page.goto(`${base}/projects/${api.state.project.id}/models?id=${model.id}`);
    await page.getByRole('button', { name: 'バージョンを作成', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: `${model.name} · バージョンを作成` });
    const openUpload = async () => {
      await dialog.getByRole('button', { name: 'Artifactをアップロード', exact: true }).click();
      const upload = page.getByRole('dialog', { name: 'Artifactをアップロード' });
      await upload.waitFor();
      return upload;
    };
    const chooseFile = async (upload, path) => {
      await upload.locator('input[type=file]').setInputFiles({
        name: path.split('/').at(-1),
        mimeType: 'application/octet-stream',
        buffer: Buffer.from(`weights uploaded from the version form: ${path}`),
      });
      await upload.getByRole('textbox', { name: '保存パス' }).fill(path);
      // The start waits for the check against unfinished uploads; Enter before it does nothing.
      await upload.locator('footer button.primary:not([disabled])').waitFor();
    };

    const closing = await openUpload();
    await closing.locator('header').getByRole('button', { name: '閉じる' }).click();
    await closing.waitFor({ state: 'detached' });
    assert.equal(choices.versionSaves.length, 0, 'the upload dialog\'s × saved the version');
    await dialog.getByRole('button', { name: 'Artifactをアップロード', exact: true }).waitFor();

    const started = await openUpload();
    await chooseFile(started, 'uploads/weights-by-button.bin');
    await screenshot(`09-version-weights-upload-${suffix}`);
    let releaseUpload;
    choices.heldUploads.gate = new Promise((resolve) => {
      releaseUpload = resolve;
    });
    // Had the start reached the version form, the form would be saved (or the page submitted and
    // reloaded) before the file goes out, so whichever comes first tells.
    const firstOf = (waits) =>
      Promise.race(waits.map(([waiting, outcome]) => waiting.then(() => outcome, () => null)));
    const isFileUpload = (request) =>
      request.method() === 'PUT' && request.url().includes('/artifacts?');
    const isVersionSave = (request) =>
      request.method() === 'POST' && request.url().endsWith(`/models/${model.id}/versions`);
    const startOutcome = firstOf([
      [page.waitForRequest(isFileUpload), 'uploading'],
      [page.waitForRequest(isVersionSave), 'version saved'],
      [page.waitForEvent('framenavigated'), 'page reloaded'],
    ]);
    await started.getByRole('button', { name: 'アップロードを開始', exact: true }).click();
    assert.equal(await startOutcome, 'uploading', '［アップロードを開始］ reached the version form');
    assert.equal(choices.versionSaves.length, 0, '［アップロードを開始］ saved the version');
    releaseUpload();
    choices.heldUploads.gate = null;
    await started.waitFor({ state: 'detached' });
    await dialog.getByText('uploads/weights-by-button.bin', { exact: true }).waitFor();
    assert.equal(choices.versionSaves.length, 0, 'the finished upload saved the version');
    await screenshot(`10-version-weights-uploaded-${suffix}`);

    // Enter in the upload's path field submits only the upload.
    await dialog.getByRole('button', { name: '選び直す', exact: true }).click();
    const entered = await openUpload();
    await chooseFile(entered, 'uploads/weights-by-enter.bin');
    await entered.getByRole('textbox', { name: '保存パス' }).press('Enter');
    await entered.waitFor({ state: 'detached' });
    await dialog.getByText('uploads/weights-by-enter.bin', { exact: true }).waitFor();
    assert.equal(choices.versionSaves.length, 0, 'Enter in the upload saved the version');

    await dialog.getByRole('button', { name: '保存', exact: true }).click();
    await dialog.waitFor({ state: 'detached' });
    const uploaded = api.state.artifacts.find((artifact) => artifact.path === 'uploads/weights-by-enter.bin');
    assert.deepEqual(choices.versionSaves, [
      { parentModelVersionIds: [], artifactId: uploaded.id, metadata: {} },
    ]);
    await context.close();
  }

  {
    console.log('Model version: a pasted artifact:// is taken, an unknown id is said so');
    const choices = createChoicesApi();
    const { api, model } = choices;
    const { context, page, screenshot } = await openPage({ choices });
    await page.goto(`${base}/projects/${api.state.project.id}/models?id=${model.id}`);
    await page.getByRole('button', { name: 'バージョンを作成', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: `${model.name} · バージョンを作成` });
    const weights = dialog.getByRole('searchbox', { name: '重みのArtifact' });
    // Without a Run the Project's Artifacts are listed, the upload without a Run included.
    await dialog.getByRole('button', { name: /weights-manual\.bin/ }).waitFor();
    await weights.fill('artifact://00000000-0000-4000-8000-0000000fffff');
    await dialog.getByText('このプロジェクトに、そのIDのArtifactはありません。', { exact: true }).waitFor();
    // A search left without a pick is not saved silently.
    await dialog.getByRole('button', { name: '保存', exact: true }).click();
    await dialog.getByText('一覧から選んでください', { exact: false }).waitFor();
    assert.equal(choices.versionSaves.length, 0);
    await weights.fill(`artifact://${choices.uploadedWeights.id}`);
    await dialog.getByRole('button', { name: '選び直す', exact: true }).waitFor();
    await dialog.getByText('uploads/weights-manual.bin', { exact: true }).waitFor();
    // An artifact:// typed as the weights URI is offered as the weights Artifact instead.
    await dialog.getByRole('button', { name: '選び直す', exact: true }).click();
    await dialog.getByRole('textbox', { name: '重みのURI' }).fill(`artifact://${choices.uploadedWeights.id}`);
    await dialog.getByRole('button', { name: '重みのArtifactとして選ぶ', exact: true }).click();
    await dialog.getByRole('button', { name: '選び直す', exact: true }).waitFor();
    await screenshot('03-version-pasted-artifact-uri');
    await dialog.getByRole('textbox', { name: 'バージョン', exact: true }).fill('7');
    await dialog.getByRole('button', { name: '保存', exact: true }).click();
    await dialog.waitFor({ state: 'detached' });
    assert.deepEqual(choices.versionSaves.at(-1), {
      version: '7',
      parentModelVersionIds: [],
      artifactId: choices.uploadedWeights.id,
      metadata: {},
    });

    console.log('Models: the default code version shows by its name, also for a viewer');
    await page.getByRole('link', { name: 'v1', exact: true }).waitFor();
    await page.goto(`${base}/projects/${api.state.project.id}/models?id=${model.id}&version=${api.state.modelVersions[0].id}`);
    // The version's own default code, not the family's code versions listed under the Model.
    await page.locator('.version-detail').getByRole('link', { name: 'UI検証コード / v1', exact: true }).waitFor();
    await screenshot('04-registry-default-code-by-name', { fullPage: true });
    await context.close();
  }

  for (const viewport of [WIDE, NARROW]) {
    const suffix = viewport === WIDE ? 'desktop' : 'mobile';
    console.log(`Model (${suffix}): the family is chosen from the existing ones; a case-only twin is warned`);
    const choices = createChoicesApi();
    const { api } = choices;
    const { context, page, screenshot } = await openPage({ choices, viewport });
    await page.goto(`${base}/projects/${api.state.project.id}/models`);
    await page.getByRole('button', { name: 'モデルを登録', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'モデルを登録' });
    await dialog.getByRole('textbox', { name: '名前', exact: true }).fill('UI検証モデル v2');
    const family = dialog.getByRole('combobox', { name: 'モデル系列' });
    await family.click();
    await dialog.getByRole('option', { name: /qwen3/ }).waitFor();
    await family.fill('Qwen3');
    await dialog.getByText('「qwen3」が既にあります', { exact: false }).waitFor();
    await screenshot(`05-model-family-case-warning-${suffix}`);
    await family.fill('qw');
    await dialog.getByRole('option', { name: /qwen3.*モデル1件・コード1件/ }).click();
    assert.equal(await family.inputValue(), 'qwen3');
    await dialog.getByRole('button', { name: '保存', exact: true }).click();
    await dialog.waitFor({ state: 'detached' });
    assert.deepEqual(choices.modelSaves, [{ name: 'UI検証モデル v2', family: 'qwen3', description: '' }]);
    await context.close();
  }

  {
    console.log('Tasks: an empty code version list says why');
    const choices = createChoicesApi();
    const { api } = choices;
    const { context, page, screenshot } = await openPage({ choices });
    await page.goto(`${base}/projects/${api.state.project.id}/tasks`);
    await page.getByRole('button', { name: 'Taskを作成', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('combobox', { name: '実行種別' }).selectOption('evaluation');
    await dialog.getByText('実行種別「評価」に対応するコードバージョンがありません', { exact: false }).waitFor();
    await dialog.getByRole('combobox', { name: '実行種別' }).selectOption('inference');
    const qwen2Version = api.state.modelVersions.find((version) => version.modelId === choices.qwen2Model.id);
    await dialog.getByRole('combobox', { name: 'モデルバージョン' }).selectOption(qwen2Version.id);
    await dialog.getByText('モデル系列「qwen2」に対応するコードバージョンがありません', { exact: false }).waitFor();
    await dialog.getByText('コードバージョンには「Qwen2」と書かれています', { exact: false }).waitFor();
    assert.equal(await dialog.getByRole('link', { name: 'Codeを開く', exact: true }).getAttribute('href'),
      `/projects/${api.state.project.id}/codes`);
    await screenshot('06-task-no-code-reason');
    await context.close();
  }

  for (const viewport of [WIDE, NARROW]) {
    const suffix = viewport === WIDE ? 'desktop' : 'mobile';
    console.log(`Promotion policy (${suffix}): metrics and aliases are offered from what exists`);
    const choices = createChoicesApi();
    const { api, model } = choices;
    const { context, page, screenshot } = await openPage({ choices, viewport });
    await page.goto(`${base}/projects/${api.state.project.id}/models?id=${model.id}`);
    await page.getByRole('tab', { name: '昇格policy' }).click();
    await page.getByRole('button', { name: '昇格policyを作成' }).click();
    const dialog = page.getByRole('dialog', { name: '昇格policyを作成' });
    await dialog.getByRole('textbox', { name: '名前', exact: true }).fill('WERゲート');
    await dialog.getByRole('combobox', { name: '対象モデル' }).selectOption(model.id);
    const target = dialog.getByRole('combobox', { name: '対象alias' });
    await target.fill('');
    await target.click();
    await dialog.getByRole('option', { name: /production.*モデルで使用中/ }).waitFor();
    await target.fill('champion');
    await dialog.getByText('「champion」はまだ使われていない新しいAliasです。', { exact: true }).waitFor();
    await dialog.getByRole('combobox', { name: '評価ルール' }).selectOption(choices.evaluationRule.id);
    await dialog.getByText('この評価ルールの評価Runに記録された指標名を候補に出しています。', { exact: true }).waitFor();
    const metric = dialog.getByRole('combobox', { name: 'メトリクス' });
    await metric.click();
    await metric.fill('wre');
    await metric.fill('evaluation.wre');
    await dialog.getByText('「evaluation.wre」は評価Runに記録されていません', { exact: false }).waitFor();
    await metric.fill('wer');
    await dialog.getByRole('option', { name: 'evaluation.wer', exact: true }).waitFor();
    await metric.scrollIntoViewIfNeeded();
    await screenshot(`07-policy-metric-candidates-${suffix}`);
    await dialog.getByRole('option', { name: 'evaluation.wer', exact: true }).click();
    await dialog.getByRole('textbox', { name: '閾値' }).fill('0.1');
    await dialog.getByRole('button', { name: '作成', exact: true }).click();
    await dialog.waitFor({ state: 'detached' });
    const saved = choices.policies.at(-1);
    assert.equal(saved.targetAlias, 'champion');
    assert.equal(saved.baselineAlias, 'production');
    assert.equal(saved.criteria[0].metric, 'evaluation.wer');
    await context.close();
  }

  {
    console.log('Alias: a mistyped alias shows as new before it is created');
    const choices = createChoicesApi();
    const { api, model } = choices;
    const { context, page, screenshot } = await openPage({ choices });
    await page.goto(`${base}/projects/${api.state.project.id}/models?id=${model.id}`);
    await page.getByRole('button', { name: 'Aliasを設定', exact: true }).click();
    const dialog = page.getByRole('dialog');
    const alias = dialog.getByRole('combobox', { name: 'Alias' });
    await alias.fill('producton');
    await dialog.getByText('「producton」はまだ使われていない新しいAliasです。', { exact: true }).waitFor();
    await alias.fill('prod');
    await dialog.getByRole('option', { name: /production/ }).waitFor();
    await screenshot('08-alias-candidates');
    await context.close();
  }

  {
    console.log('Viewer: the lookups only read, so the default code reads by name for a viewer too');
    const choices = createChoicesApi();
    const { api, model } = choices;
    api.state.project.role = 'viewer';
    const { context, page } = await openPage({ choices });
    await page.goto(`${base}/projects/${api.state.project.id}/models?id=${model.id}`);
    // The version's own default code, not the family's code versions listed under the Model.
    await page.locator('.version-detail').getByRole('link', { name: 'UI検証コード / v1', exact: true }).waitFor();
    assert.equal(await page.getByRole('button', { name: 'バージョンを作成', exact: true }).count(), 0);
    await context.close();
  }
  assert.deepEqual(pageErrors, []);
  console.log('Model choices: all checks passed');
} finally {
  await browser.close();
}
