// A first-time user's path with a mocked API (usability audit A): a Project without Experiments
// offers to create the first one instead of a Run; an Experiment without Runs opens the SDK guide
// and says what to do next; a name already taken offers that Experiment; every token button opens
// one dialog whose purpose chooses the scopes, and the issued token is copied apart from a settings
// example that holds no token; a filter that does not suit its field shows the corrected filter
// without a retry; a Run's page names its Experiment and copies its ID; a new Project states its
// default storage and folds the others away. At 390px the empty Experiment list is not cut and
// nothing scrolls sideways. MMT_SCREENSHOT_DIR receives screenshots.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { createBrowserApi } from './browserApi.mjs';
import { openProjectSwitcher } from './projectSwitcher.mjs';

const modulePath = process.env.MMT_PLAYWRIGHT_MODULE;
if (!modulePath) throw new Error('Set MMT_PLAYWRIGHT_MODULE to an installed Playwright index.mjs');
const { chromium } = await import(pathToFileURL(modulePath).href);
const base = process.env.MMT_WEB_URL ?? 'http://127.0.0.1:5182';
const outputDirectory = process.env.MMT_SCREENSHOT_DIR;
if (outputDirectory) await mkdir(outputDirectory, { recursive: true });
const DESKTOP = { width: 1440, height: 960 };
const PHONE = { width: 390, height: 844 };
// What the mock answers for a filter the API cannot run, like the API's 400.
const REJECTED_FILTER = 'attributes.unknown_attribute = 1';
const REJECTION_MESSAGE = '未対応の検索属性です: unknown_attribute';

const browser = await chromium.launch({
  headless: true,
  ...(process.env.MMT_CHROMIUM_PATH ? { executablePath: process.env.MMT_CHROMIUM_PATH } : {}),
  args: ['--no-sandbox'],
});
const pageErrors = [];

/** Opens `path(api)` of the mocked Project after `prepare(api.state)` shapes the data. */
async function openPage({ path, prepare = () => {}, viewport = DESKTOP, role = 'admin' }) {
  const context = await browser.newContext({ viewport });
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: base });
  const api = createBrowserApi();
  api.state.loggedIn = true;
  api.state.project.role = role;
  prepare(api.state);
  const searchBodies = [];
  await context.route(
    (url) => url.pathname.startsWith('/api/'),
    (route) => {
      const request = route.request();
      if (request.method() === 'POST' && new URL(request.url()).pathname.endsWith('/runs/search')) {
        const body = request.postDataJSON();
        searchBodies.push(body);
        if (body.filter === REJECTED_FILTER)
          return route.fulfill({
            status: 400,
            contentType: 'application/json',
            body: JSON.stringify({ error: REJECTION_MESSAGE, code: 'invalid_parameter_value' }),
          });
      }
      return api.route(route);
    },
  );
  const page = await context.newPage();
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.goto(`${base}/projects/${api.state.project.id}${path(api.state)}`);
  return { context, page, api, searchBodies };
}
const clipboard = (page) => page.evaluate(() => navigator.clipboard.readText());
const screenshot = async (page, name) => {
  if (outputDirectory) await page.screenshot({ path: `${outputDirectory}/${name}.png` });
};
async function assertNoSidewaysScroll(page, where) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  assert.ok(overflow <= 0, `${where} scrolls sideways by ${overflow}px`);
}

try {
  console.log('Browser check: a Project without Experiments starts with the first Experiment');
  for (const viewport of [DESKTOP, PHONE]) {
    const empty = await openPage({
      viewport,
      path: () => '/experiments',
      prepare: (state) => {
        state.experiments = [];
        state.runs = [];
      },
    });
    const header = empty.page.locator('header.page-header');
    await header.getByRole('button', { name: '最初の実験を作成' }).waitFor();
    assert.equal(await header.getByRole('button', { name: 'Runを作成' }).count(), 0);
    await empty.page.getByText(/^まだ実験がありません。実験は、同じ目的のRunをまとめる単位です/).waitFor();
    // The Experiment list says so in one short line that its box does not cut.
    const sidebarEmpty = empty.page.locator('.experiment-sidebar-empty');
    await sidebarEmpty.waitFor();
    const [lineBox, sidebarBox] = await Promise.all([
      sidebarEmpty.boundingBox(),
      empty.page.locator('.experiment-sidebar').boundingBox(),
    ]);
    assert.ok(
      lineBox.y + lineBox.height <= sidebarBox.y + sidebarBox.height,
      `the empty line ends ${lineBox.y + lineBox.height}, the list ${sidebarBox.y + sidebarBox.height}`,
    );
    if (viewport === PHONE) {
      await assertNoSidewaysScroll(empty.page, 'Experiments without Experiments');
      await screenshot(empty.page, '01-no-experiments-phone');
      await empty.context.close();
      continue;
    }
    await screenshot(empty.page, '01-no-experiments-desktop');
    await header.getByRole('button', { name: '最初の実験を作成' }).click();
    const dialog = empty.page.getByRole('dialog', { name: '実験を作成' });
    await dialog.getByLabel('名前').fill('whisper-small-finetune');
    await dialog.getByRole('button', { name: '保存' }).click();
    await dialog.waitFor({ state: 'detached' });
    await empty.page.waitForURL(/experiment=/);
    // The new Experiment has no Run, so the guide to recording opens by itself.
    await empty.page.locator('section.recording-connection').waitFor();
    assert.equal(
      await header.getByRole('button', { name: 'SDKで記録' }).getAttribute('aria-expanded'),
      'true',
    );
    await header.getByRole('button', { name: 'Runを作成' }).waitFor();
    await empty.context.close();
  }

  console.log('Browser check: an Experiment without Runs opens the guide and names the next step');
  const firstRun = await openPage({
    path: (state) => `/experiments?experiment=${state.experiments.at(-1).id}`,
    prepare: (state) => {
      state.experiments.push({
        ...state.experiments[0],
        id: 'f1a5e0c4-0000-4000-8000-000000000001',
        name: 'まだRunの無い実験',
        runCount: 0,
      });
    },
  });
  const guide = firstRun.page.locator('section.recording-connection');
  await guide.getByRole('heading', { name: 'SDK・MLflow 3から接続' }).waitFor();
  await firstRun.page.getByText(/^この実験にはまだRunがありません。/).waitFor();
  await screenshot(firstRun.page, '02-experiment-without-runs');
  const toggle = firstRun.page.getByRole('button', { name: 'SDKで記録' });
  await toggle.click();
  assert.equal(await guide.count(), 0);
  // An Experiment with Runs keeps the guide closed until asked.
  await firstRun.page
    .locator('.experiment-item', { hasText: firstRun.api.state.experiments[0].name })
    .click();
  await firstRun.page.getByRole('link', { name: firstRun.api.state.runs[0].name }).first().waitFor();
  assert.equal(await toggle.getAttribute('aria-expanded'), 'false');

  console.log('Browser check: a taken Experiment name offers that Experiment');
  await firstRun.page.getByRole('button', { name: '実験を作成', exact: true }).click();
  const experimentDialog = firstRun.page.getByRole('dialog', { name: '実験を作成' });
  await experimentDialog.getByLabel('名前').fill(' まだRunの無い実験 ');
  await experimentDialog.getByText('同じ名前の実験が既にあります。').waitFor();
  await screenshot(firstRun.page, '03-taken-experiment-name');
  await experimentDialog.getByRole('button', { name: 'その実験を開く' }).click();
  await experimentDialog.waitFor({ state: 'detached' });
  await firstRun.page.waitForURL(/experiment=f1a5e0c4-0000-4000-8000-000000000001/);

  console.log('Browser check: a manual Run says what it is for and starts as training');
  await firstRun.page.getByRole('button', { name: 'Runを作成', exact: true }).click();
  const runDialog = firstRun.page.getByRole('dialog', { name: 'Runを作成' });
  await runDialog.getByText(/^画面から作ったRunは「待機中」で始まり/).waitFor();
  assert.equal(await runDialog.getByLabel('実行種別').inputValue(), 'training');
  await runDialog.getByRole('button', { name: 'キャンセル' }).click();

  console.log('Browser check: a filter that does not suit its field is corrected before sending');
  const search = firstRun.page.getByRole('textbox', { name: '検索', exact: true });
  const searchesBefore = firstRun.searchBodies.length;
  await search.fill('params.learning_rate > 0.00005');
  await search.press('Enter');
  await firstRun.page.getByText(/params\.learning_rateは文字列として比べるので/).waitFor();
  await firstRun.page.getByText(/params\.learning_rate = '0\.00005'/).waitFor();
  assert.equal(await search.getAttribute('aria-invalid'), 'true');
  assert.equal(await firstRun.page.getByRole('button', { name: '再試行' }).count(), 0);
  assert.ok(
    firstRun.searchBodies.slice(searchesBefore).every((body) => !body.filter),
    'the refused filter was sent',
  );
  await screenshot(firstRun.page, '04-filter-kind-error');
  // A filter the API refuses is shown the same way, without a retry button.
  await search.fill(REJECTED_FILTER);
  await search.press('Enter');
  await firstRun.page.getByText(REJECTION_MESSAGE).waitFor();
  assert.equal(await firstRun.page.getByRole('button', { name: '再試行' }).count(), 0);
  // A comparison without metrics. is searched as a name, and the filter it meant is offered.
  await search.fill('loss < 0.2');
  await search.press('Enter');
  await firstRun.page.getByText(/「loss < 0\.2」はRun名として探しました/).waitFor();
  await screenshot(firstRun.page, '05-filter-suggestion');
  await firstRun.page.getByRole('button', { name: 'この式で検索' }).click();
  await firstRun.page.waitForURL((url) => url.searchParams.get('q') === 'metrics.loss < 0.2');
  await firstRun.context.close();

  console.log('Browser check: one token dialog, its purposes and the issued token');
  const settings = await openPage({ path: () => '/settings' });
  const personalTokens = settings.page
    .locator('.settings-section')
    .filter({ has: settings.page.getByRole('heading', { name: '自分のAPI token', exact: true }) });
  await personalTokens.getByRole('button', { name: 'API tokenを発行' }).click();
  const tokenDialog = settings.page.getByRole('dialog', { name: 'API tokenを発行' });
  const checkedScopes = () =>
    tokenDialog
      .locator('.checkbox-list input[type=checkbox]:checked')
      .evaluateAll((elements) =>
        elements.map((element) => element.closest('label').textContent.split(' — ')[0].trim()),
      );
  // The plain button starts from recording too, so the token works with the SDKs as issued.
  assert.equal(
    await tokenDialog.getByRole('radio', { name: 'SDK・MLflow 3から記録する' }).isChecked(),
    true,
  );
  assert.deepEqual(await checkedScopes(), ['read', 'runs:write', 'registry:write', 'artifacts:write']);
  // A person's token is not offered for a worker.
  assert.equal(await tokenDialog.getByRole('radio', { name: 'workerとしてJobを実行する' }).count(), 0);
  await tokenDialog.getByRole('radio', { name: '読み取りだけ' }).check();
  assert.deepEqual(await checkedScopes(), ['read']);
  await tokenDialog.getByRole('checkbox', { name: /^jobs:write/ }).check();
  assert.equal(await tokenDialog.getByRole('radio', { name: 'コマンドからJobを投入する' }).isChecked(), true);
  await tokenDialog.getByRole('checkbox', { name: /^runs:write/ }).check();
  assert.equal(await tokenDialog.getByRole('radio', { name: 'scopeを自分で選ぶ' }).isChecked(), true);
  await screenshot(settings.page, '06-token-purpose');
  await tokenDialog.getByRole('radio', { name: 'SDK・MLflow 3から記録する' }).check();
  await tokenDialog.getByLabel('名前').fill('laptop-sdk');
  await tokenDialog.getByRole('button', { name: '保存' }).click();
  await tokenDialog.getByText('API tokenは一度だけ表示されます', { exact: false }).waitFor();
  assert.deepEqual(
    [...settings.api.state.tokens.at(-1).scopes].sort(),
    ['artifacts:write', 'read', 'registry:write', 'runs:write'],
  );
  await tokenDialog.getByRole('button', { name: 'tokenをコピー' }).click();
  assert.equal(await clipboard(settings.page), 'browser-test-value-only');
  await tokenDialog.getByRole('button', { name: '設定例をコピー' }).click();
  const example = await clipboard(settings.page);
  assert.doesNotMatch(example, /browser-test-value-only/);
  assert.match(example, /^printf 'API token: '; read -r -s MMT_API_TOKEN; echo$/m);
  assert.match(example, /^export MLFLOW_REGISTRY_URI=.*\/api\/mlflow\/projects\//m);
  assert.match(example, /^export MLFLOW_TRACKING_TOKEN="\$MMT_API_TOKEN"$/m);
  await screenshot(settings.page, '07-token-issued');
  await settings.context.close();

  console.log('Browser check: a Run names its Experiment and copies its ID');
  const runPage = await openPage({ path: (state) => `/runs/${state.runs[0].id}` });
  const run = runPage.api.state.runs[0];
  const experimentName = runPage.api.state.experiments.find(
    (experiment) => experiment.id === run.experimentId,
  ).name;
  const eyebrow = runPage.page.locator('.page-header .eyebrow');
  await eyebrow.getByRole('link', { name: experimentName }).waitFor();
  assert.match(
    await eyebrow.getByRole('link', { name: experimentName }).getAttribute('href'),
    new RegExp(`experiment=${run.experimentId}$`),
  );
  await runPage.page.locator('.copyable-value', { hasText: 'Run ID' }).getByRole('button').click();
  assert.equal(await clipboard(runPage.page), run.id);
  await runPage.page.getByText(/^実行モード: /).first().waitFor();
  await screenshot(runPage.page, '08-run-heading');
  await runPage.context.close();

  console.log('Browser check: a new Project states its default storage and folds the others');
  const creation = await openPage({ path: () => '/experiments' });
  const switcher = await openProjectSwitcher(creation.page);
  await switcher.getByRole('option', { name: 'プロジェクトを作成', exact: true }).click();
  const projectDialog = creation.page.getByRole('dialog', { name: 'プロジェクトを作成' });
  await projectDialog.getByText('既定の保存先「filesystem」に保存します', { exact: false }).waitFor();
  assert.equal(await projectDialog.getByRole('radio', { name: /^s3/ }).count(), 0);
  await projectDialog.getByText('ほかの保存先を選ぶ', { exact: true }).click();
  await projectDialog.getByRole('radio', { name: /^s3/ }).check();
  // Choosing the default again keeps the list open.
  await projectDialog.getByRole('radio', { name: /^filesystem/ }).check();
  await projectDialog.getByRole('radio', { name: /^s3/ }).check();
  await screenshot(creation.page, '09-new-project-storage');
  await projectDialog.getByLabel('名前').fill('保存先を選んだプロジェクト');
  await projectDialog.getByRole('button', { name: '作成' }).click();
  await projectDialog.waitFor({ state: 'detached' });
  assert.equal(
    creation.api.state.projectAdministration.createRequests.at(-1).artifactBackend,
    's3',
  );
  await creation.context.close();

  assert.deepEqual(pageErrors, []);
  console.log('first-run browser check: ok');
} finally {
  await browser.close();
}
