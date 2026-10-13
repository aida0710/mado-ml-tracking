import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { createBrowserApi } from './browserApi.mjs';

const modulePath = process.env.MMT_PLAYWRIGHT_MODULE;
if (!modulePath) throw new Error('Set MMT_PLAYWRIGHT_MODULE to an installed Playwright index.mjs');
const { chromium } = await import(pathToFileURL(modulePath).href);
const browser = await chromium.launch({
  headless: true,
  args: ['--no-sandbox'],
  ...(process.env.MMT_CHROMIUM_PATH ? { executablePath: process.env.MMT_CHROMIUM_PATH } : {}),
});
const context = await browser.newContext({
  locale: 'ja-JP',
  viewport: { width: 1440, height: 1000 },
});
const base = process.env.MMT_WEB_URL ?? 'http://127.0.0.1:6085';
const directory = process.env.MMT_SCREENSHOT_DIR;
const api = createBrowserApi();
api.state.loggedIn = true;
api.state.project.name = '音声モデル研究';
const projectId = api.state.project.id;
const projectPath = `/projects/${projectId}`;
const dataset = api.state.datasetVersions[0];
const model = api.state.modelVersions[0];
const code = api.state.codeVersions[0];
const [training, evaluation, processing] = api.state.runs;
training.name = '音声モデル学習';
training.kind = 'training';
training.status = 'finished';
training.inputDatasetVersionIds = [dataset.id];
evaluation.name = '音声品質の評価';
evaluation.status = 'finished';
processing.name = '音声の前処理';
processing.status = 'finished';
model.sourceRunId = training.id;
const fixtureId = (index) => `a0000000-0000-4000-8000-${String(index).padStart(12, '0')}`;
const rawId = fixtureId(1);
dataset.parentDatasetVersionIds = [rawId];
api.state.datasetVersions.push({
  ...dataset,
  id: rawId,
  version: 'v0',
  parentDatasetVersionIds: [],
});
const graph = {
  nodes: [
    { id: rawId, kind: 'datasetVersion', label: '元の音声 v1' },
    { id: processing.id, kind: 'run', label: processing.name, status: 'finished' },
    { id: dataset.id, kind: 'datasetVersion', label: '学習用音声 v1' },
    { id: code.id, kind: 'codeVersion', label: '音声学習コード v1' },
    { id: training.id, kind: 'run', label: training.name, status: 'finished' },
    { id: fixtureId(2), kind: 'modelVersion', label: '学習元モデル v1' },
    { id: model.id, kind: 'modelVersion', label: '音声モデル v2' },
    { id: evaluation.id, kind: 'run', label: evaluation.name, status: 'finished' },
    {
      id: fixtureId(3),
      kind: 'loggedModel',
      label: '評価用の保存モデル',
      sourceRunId: evaluation.id,
    },
    { id: fixtureId(4), kind: 'run', label: '別の前処理', status: 'running' },
    { id: fixtureId(5), kind: 'datasetVersion', label: '別のデータセット v1' },
    { id: fixtureId(6), kind: 'codeVersion', label: '未使用のコード v1' },
  ],
  edges: [
    { source: rawId, target: processing.id, relation: 'input' },
    { source: processing.id, target: dataset.id, relation: 'output' },
    { source: rawId, target: dataset.id, relation: 'parentDataset' },
    { source: dataset.id, target: training.id, relation: 'input' },
    { source: code.id, target: training.id, relation: 'code' },
    { source: fixtureId(2), target: training.id, relation: 'model' },
    { source: fixtureId(2), target: model.id, relation: 'parentModel' },
    { source: training.id, target: model.id, relation: 'outputModel' },
    { source: model.id, target: evaluation.id, relation: 'model' },
    { source: evaluation.id, target: fixtureId(3), relation: 'loggedModel' },
    { source: rawId, target: fixtureId(4), relation: 'input' },
    { source: fixtureId(4), target: fixtureId(5), relation: 'output' },
  ],
};
const requests = [];
await context.route(
  (url) => url.pathname.startsWith('/api/'),
  async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname.replace(/^\/api/, '');
    requests.push({ path, method: request.method() });
    const reply = (payload) =>
      route.fulfill({ contentType: 'application/json', body: JSON.stringify(payload) });
    if (path === `${projectPath}/lineage`) return reply(graph);
    if (path === `${projectPath}/model-versions/${model.id}`)
      return reply({
        model: api.state.models[0],
        version: model,
        aliases: [],
      });
    if (path.endsWith('/evaluation-comparison'))
      return reply({
        status: 'baseline_missing',
        modelId: model.modelId,
        candidateVersionId: model.id,
        baselineAlias: 'production',
        baselineVersionId: null,
        candidateRunId: null,
        baselineRunId: null,
        referenceDatasetVersionIds: [],
        codeVersionId: null,
        evaluationRuleId: null,
        metrics: [],
      });
    if (path === `${projectPath}/model-versions/${model.id}/evaluations`)
      return reply({ modelVersionId: model.id, items: [], nextCursor: null });
    if (path.endsWith('/saved-views') || path === `${projectPath}/comments`)
      return reply({ items: [], nextCursor: null });
    return api.route(route);
  },
);
const page = await context.newPage();
const pageErrors = [];
page.on('pageerror', (error) => pageErrors.push(error.message));
page.on('console', (message) => {
  if (message.type() === 'error' && /TypeError:|ReferenceError:/.test(message.text()))
    pageErrors.push(message.text());
});
const canvas = () => page.locator('.lineage-canvas');
const node = (id) => canvas().locator(`.react-flow__node[data-id="${id}"]`);
const viewport = () => canvas().locator('.react-flow__viewport');
async function screenshot(name) {
  if (!directory) return;
  await mkdir(directory, { recursive: true });
  await page.screenshot({ path: `${directory}/${name}.png`, fullPage: true });
}
async function switchLanguage(name) {
  await page.getByRole('button', { name: /^(Language|表示言語):/ }).click();
  await page.getByRole('menuitemradio', { name, exact: true }).click();
}
async function waitForViewportChange(previous) {
  await page.waitForFunction(
    (style) =>
      document.querySelector('.lineage-canvas .react-flow__viewport')?.getAttribute('style') !==
      style,
    previous,
  );
}
async function assertNoPageOverflow() {
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
}

try {
  console.log('Lineage: every MMT node and relation appears, with the overview');
  await page.goto(`${base}${projectPath}/lineage`);
  await node(training.id).waitFor();
  assert.equal(await canvas().locator('.react-flow__node').count(), graph.nodes.length);
  assert.equal(await canvas().locator('.react-flow__edge').count(), graph.edges.length);
  await canvas().getByRole('img', { name: 'グラフの全体図' }).waitFor();
  await assertNoPageOverflow();
  const startWrites = requests.filter((request) => request.method !== 'GET').length;

  console.log('Lineage: controls zoom, fit and pan the graph');
  const beforeZoom = await viewport().getAttribute('style');
  await canvas().getByRole('button', { name: '拡大', exact: true }).click();
  await waitForViewportChange(beforeZoom);
  await canvas().getByRole('button', { name: '全体を表示', exact: true }).click();
  const bounds = await canvas().boundingBox();
  const beforePan = await viewport().getAttribute('style');
  await page.mouse.move(bounds.x + 24, bounds.y + 24);
  await page.mouse.down();
  await page.mouse.move(bounds.x + 84, bounds.y + 50, { steps: 8 });
  await page.mouse.up();
  await waitForViewportChange(beforePan);

  console.log('Lineage: search selects an item, traces each direction and preserves locale state');
  const search = page.getByRole('searchbox', { name: 'グラフ内を検索' });
  await search.fill(training.name);
  await page
    .getByRole('region', { name: 'グラフ内の検索結果' })
    .getByRole('button', { name: /音声モデル学習/ })
    .click();
  await node(training.id).locator('[data-selected]').waitFor();
  await page.getByRole('button', { name: '生成元', exact: true }).click();
  assert.ok(
    await node(dataset.id).evaluate((element) =>
      element.classList.contains('lineage-flow-node--path'),
    ),
  );
  assert.ok(
    await node(model.id).evaluate((element) =>
      element.classList.contains('lineage-flow-node--muted'),
    ),
  );
  assert.ok(
    await node(fixtureId(4)).evaluate((element) =>
      element.classList.contains('lineage-flow-node--muted'),
    ),
  );
  await page.getByRole('button', { name: '生成先', exact: true }).click();
  assert.ok(
    await node(model.id).evaluate((element) =>
      element.classList.contains('lineage-flow-node--path'),
    ),
  );
  assert.ok(
    await node(dataset.id).evaluate((element) =>
      element.classList.contains('lineage-flow-node--muted'),
    ),
  );
  await page.getByRole('button', { name: '前後', exact: true }).click();
  await search.fill('Corpus draft');
  const lineageReads = requests.filter((request) => request.path.endsWith('/lineage')).length;
  await switchLanguage('English');
  assert.equal(
    await page.getByRole('searchbox', { name: 'Search graph' }).inputValue(),
    'Corpus draft',
  );
  await node(training.id).locator('[data-selected]').waitFor();
  await canvas().getByRole('button', { name: 'Zoom in', exact: true }).waitFor();
  assert.equal(
    requests.filter((request) => request.path.endsWith('/lineage')).length,
    lineageReads,
  );
  await page.getByRole('searchbox', { name: 'Search graph' }).fill('');
  await screenshot('lineage-desktop-en');
  await switchLanguage('日本語');
  await screenshot('lineage-desktop-ja');
  await page.getByRole('button', { name: '選択を解除', exact: true }).click();
  const position = await node(training.id).evaluate((element) => element.style.transform);
  await node(training.id).focus();
  await page.keyboard.press('Enter');
  await node(training.id).locator('[data-selected]').waitFor();
  await page.keyboard.press('Delete');
  await page.keyboard.press('ArrowRight');
  assert.equal(await canvas().locator('.react-flow__node').count(), graph.nodes.length);
  assert.equal(await node(training.id).evaluate((element) => element.style.transform), position);
  assert.equal(requests.filter((request) => request.method !== 'GET').length, startWrites);
  await page.locator('.lineage-selection').getByRole('link', { name: '詳細を開く' }).click();
  await page.waitForURL(`${base}${projectPath}/runs/${training.id}`);
  await page.goto(`${base}${projectPath}/lineage?focus=${training.id}`);
  await node(training.id).getByRole('link').press('Enter');
  await page.waitForURL(`${base}${projectPath}/runs/${training.id}`);

  console.log('Lineage: version focus keeps its nearby graph and can return to the full graph');
  await page.goto(`${base}${projectPath}/lineage?focus=${dataset.id}`);
  await page.getByTestId('lineage-focus').waitFor();
  await node(dataset.id).locator('[data-selected]').waitFor();
  assert.ok((await canvas().locator('.react-flow__node').count()) < graph.nodes.length);
  await page
    .getByTestId('lineage-focus')
    .getByRole('button', { name: '全体を表示', exact: true })
    .click();
  await page.getByTestId('lineage-focus').waitFor({ state: 'detached' });
  assert.equal(await canvas().locator('.react-flow__node').count(), graph.nodes.length);

  console.log(
    'Lineage: the narrow view leads with the relation list and the graph remains inside the page',
  );
  await page.setViewportSize({ width: 320, height: 720 });
  await page.locator('.lineage-graph.narrow').waitFor();
  assert.ok(await page.locator('.graph-relations').evaluate((element) => element.open));
  assert.ok(
    await page.evaluate(() => {
      const relations = document.querySelector('.graph-relations');
      const graph = document.querySelector('.lineage-canvas');
      return Boolean(relations.compareDocumentPosition(graph) & Node.DOCUMENT_POSITION_FOLLOWING);
    }),
  );
  await assertNoPageOverflow();
  await canvas().scrollIntoViewIfNeeded();
  await page.getByRole('button', { name: 'ダークテーマ', exact: true }).click();
  await screenshot('lineage-mobile-dark');

  console.log('Lineage: the existing model training ancestry uses the same graph');
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`${base}${projectPath}/models/${model.modelId}/versions/${model.id}`);
  await page.locator('.model-version-lineage .react-flow__node').first().waitFor();
  assert.ok((await page.locator('.model-version-lineage .react-flow__node').count()) >= 3);
  await page.locator('.model-version-lineage').scrollIntoViewIfNeeded();
  await screenshot('lineage-model-dark');

  console.log('Lineage: viewers can inspect the graph without writing data');
  api.state.project.role = 'viewer';
  api.state.user.isAdmin = false;
  await page.goto(`${base}${projectPath}/lineage`);
  await node(training.id).waitFor();
  const viewerWrites = requests.filter((request) => request.method !== 'GET').length;
  await page.getByRole('searchbox', { name: 'グラフ内を検索' }).fill(training.name);
  await page
    .getByRole('region', { name: 'グラフ内の検索結果' })
    .getByRole('button', { name: /音声モデル学習/ })
    .click();
  await page.getByRole('button', { name: '生成元', exact: true }).click();
  assert.equal(requests.filter((request) => request.method !== 'GET').length, viewerWrites);
  assert.deepEqual(pageErrors, []);
  if (directory)
    await writeFile(
      `${directory}/browser-result.json`,
      JSON.stringify(
        {
          checks: [
            'all node kinds and relations',
            'zoom/fit/pan/minimap',
            'search and upstream/downstream',
            'keyboard selection and read-only graph',
            'locale preserves selection/input and does not refetch',
            'detail navigation',
            'version focus',
            '320px/table order/dark theme',
            'model training graph',
            'viewer',
          ],
          pageErrors,
        },
        null,
        2,
      ),
    );
  console.log('Lineage browser checks passed.');
} catch (failure) {
  console.error('Page errors:', pageErrors);
  console.error('Page alerts:', await page.getByRole('alert').allTextContents());
  await screenshot('lineage-failure');
  throw failure;
} finally {
  await browser.close();
}
