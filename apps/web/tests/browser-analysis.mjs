// Runの分析パネル（平行座標、パラメータの重要度、散布図）のブラウザでの確認。モックのAPIを相手に
// tests/fixtures/analysis-harness.htmlで描く。ブラッシングでRunの一覧へ渡す選択が絞られる、重要度の
// 表が並べ替わる、散布図の点でRunが開く、SweepではSweepのobjectiveを使う、5000件のRunでも
// ドラッグ中に遅れない。
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

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
if (screenshotDirectory) await mkdir(screenshotDirectory, { recursive: true });
const SMALL_RUN_COUNT = 300;
const LARGE_RUN_COUNT = 5000;
// 5000件のRunでドラッグ1回分にかけてよい時間（依頼の目標）。Playwrightとの往復を含む。
const DRAG_STEP_BUDGET_MS = 200;
const DRAG_STEPS = 12;

// 応答に入るid。画面は応答を契約のスキーマで確かめるので、どれもUUIDにする（URLのexp-300などはそのまま）。
const PROJECT_ID = '00000000-0000-4000-8000-0000000a0001';
const EXPERIMENT_ID = '00000000-0000-4000-8000-0000000a0002';
const SWEEP_ID = '00000000-0000-4000-8000-0000000a0003';
const TASK_ID = '00000000-0000-4000-8000-0000000a0004';
const USER_ID = '00000000-0000-4000-8000-0000000a0005';
const CREATED_AT = '2026-10-08T00:00:00.000Z';

// 決まった値を返す疑似乱数。確認を何度実行しても同じRunになる。
function random(seed) {
  let state = seed;
  return () => {
    state = (state * 1103515245 + 12345) % 2147483648;
    return state / 2147483648;
  };
}

function syntheticRuns(count) {
  const next = random(count);
  const optimizers = ['adam', 'adamw', 'sgd'];
  return Array.from({ length: count }, (_, index) => {
    const lr = 10 ** (-5 + 4 * next());
    const batchSize = [16, 32, 64][index % 3];
    const optimizer = optimizers[Math.floor(next() * optimizers.length)];
    const dropout = Number((next() * 0.5).toFixed(3));
    const loss = Math.abs(Math.log10(lr) + 3) * 0.3 + (optimizer === 'sgd' ? 0.4 : 0) + next() * 0.1;
    return {
      runId: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
      name: `trial-${String(index).padStart(4, '0')}`,
      experimentId: EXPERIMENT_ID,
      status: 'finished',
      // 7件ごとにdropoutの無いRunを置き、値の無い帯を試す。
      params: { lr, batch_size: batchSize, optimizer, ...(index % 7 === 0 ? {} : { dropout }) },
      metrics: { loss, accuracy: 1 - loss / 2 },
      objective: index % 11 === 0 ? null : loss,
      sweepTrialIndex: index,
    };
  });
}

const runSets = {
  'exp-300': syntheticRuns(SMALL_RUN_COUNT),
  'exp-5000': syntheticRuns(LARGE_RUN_COUNT),
  'sweep-300': syntheticRuns(SMALL_RUN_COUNT),
};

function runsOf(body) {
  if (body.runSet.sweepId) return runSets[body.runSet.sweepId];
  return runSets[body.runSet.search.experimentIds[0]];
}

function analysisTable(body) {
  const runs = runsOf(body);
  const isSweep = Boolean(body.runSet.sweepId);
  const paramKeys = ['batch_size', 'dropout', 'lr', 'optimizer'];
  const coverage = (key) => runs.filter((run) => key in run.params).length / runs.length;
  const range = (values) => ({ min: Math.min(...values), max: Math.max(...values) });
  return {
    runs: runs.map((run) => ({
      runId: run.runId,
      name: run.name,
      experimentId: run.experimentId,
      status: run.status,
      params: run.params,
      metrics: Object.fromEntries(body.metrics.filter((key) => key in run.metrics).map((key) => [key, run.metrics[key]])),
      ...(isSweep ? { sweepTrialIndex: run.sweepTrialIndex, objective: run.objective } : {}),
    })),
    params: paramKeys.map((key) =>
      key === 'optimizer'
        ? { key, kind: 'categorical', values: ['adam', 'adamw', 'sgd'], coverage: coverage(key) }
        : { key, kind: 'numeric', coverage: coverage(key) },
    ),
    metrics: body.metrics.map((key) => ({ key, ...range(runs.map((run) => run.metrics[key])) })),
    ...(isSweep
      ? { objective: { metric: 'loss', goal: 'minimize', aggregation: 'last', ...range(runs.map((run) => run.metrics.loss)) } }
      : {}),
  };
}

function parameterImportance(body) {
  const runs = runsOf(body);
  return {
    targetMetric: body.targetMetric ?? 'loss',
    targetSource: body.targetMetric ? 'latest_metric' : 'sweep_objective',
    runCount: runs.length,
    skippedRunCount: 0,
    entries: [
      { param: 'lr', kind: 'numeric', correlation: -0.62, importance: 0.55, permutationImportance: 0.4, coverage: 1 },
      { param: 'optimizer', kind: 'categorical', correlation: null, importance: 0.3, permutationImportance: 0.35, coverage: 1 },
      { param: 'dropout', kind: 'numeric', correlation: 0.05, importance: 0.1, permutationImportance: 0.01, coverage: 0.86 },
      { param: 'batch_size', kind: 'numeric', correlation: 0.02, importance: 0.05, permutationImportance: 0.02, coverage: 1 },
    ],
    excluded: [{ param: 'seed_label', reason: 'high_cardinality' }],
    importanceUnavailableReason: null,
    outOfBagR2: 0.81,
  };
}

/** メトリクスの名前の候補を集める検索が読む、契約どおりのRun。 */
function searchedRun(latestMetrics) {
  return {
    id: '00000000-0000-4000-8000-0000000a0100',
    projectId: PROJECT_ID,
    experimentId: EXPERIMENT_ID,
    name: 'trial-sample',
    kind: 'training',
    status: 'finished',
    parameters: {},
    tags: {},
    latestMetrics,
    modelVersionId: null,
    codeVersionId: null,
    inputDatasetVersionIds: [],
    upstreamDatasetVersionIds: [],
    outputDatasetVersionIds: [],
    outputModelVersionIds: [],
    parentRunId: null,
    environment: {},
    createdBy: USER_ID,
    createdByName: null,
    createdAt: CREATED_AT,
    startedAt: null,
    endedAt: null,
    error: null,
  };
}

const sweep = {
  id: SWEEP_ID,
  projectId: PROJECT_ID,
  name: 'sweep-300',
  taskId: TASK_ID,
  taskRevision: 1,
  experimentId: EXPERIMENT_ID,
  method: 'random',
  searchSpace: { lr: { distribution: 'log_uniform', min: 0.00001, max: 0.1 } },
  objective: { metric: 'loss', goal: 'minimize', aggregation: 'last' },
  maxTrials: SMALL_RUN_COUNT,
  parallelism: 4,
  earlyStopping: null,
  seed: 0,
  targetId: null,
  gpuIds: null,
  status: 'finished',
  statusReason: null,
  createdBy: USER_ID,
  createdAt: CREATED_AT,
  updatedAt: CREATED_AT,
  finishedAt: CREATED_AT,
  trialCounts: {
    queued: 0,
    running: 0,
    finished: SMALL_RUN_COUNT,
    failed: 0,
    canceled: 0,
    early_stopped: 0,
    total: SMALL_RUN_COUNT,
  },
  bestTrial: null,
};

function sweepTrial(run, index) {
  return {
    id: `00000000-0000-4000-8000-${String(200000 + index).padStart(12, '0')}`,
    sweepId: SWEEP_ID,
    trialIndex: run.sweepTrialIndex,
    parameters: run.params,
    runId: run.runId,
    jobId: `00000000-0000-4000-8000-${String(300000 + index).padStart(12, '0')}`,
    state: 'finished',
    objectiveValue: run.objective,
    objectiveStep: null,
    stopReason: null,
    runStatus: 'finished',
    jobStatus: 'finished',
    jobCancelRequested: false,
    createdAt: CREATED_AT,
    endedAt: CREATED_AT,
  };
}

const metricComparison = {
  runs: [],
  baselineRunId: null,
  datasetVersions: [],
  modelVersions: [],
  rows: [
    { namespace: 'metrics', key: 'accuracy', values: [] },
    { namespace: 'metrics', key: 'loss', values: [] },
  ],
};

const apiRequests = [];
async function routeApi(page) {
  await page.route(
    (url) => url.pathname.startsWith('/api/'),
    async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      const body = request.postData() ? JSON.parse(request.postData()) : undefined;
      apiRequests.push(`${request.method()} ${url.pathname}`);
      const json = (payload) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(payload) });
      if (url.pathname.endsWith('/runs/analysis/table')) return json(analysisTable(body));
      if (url.pathname.endsWith('/runs/analysis/parameter-importance')) return json(parameterImportance(body));
      if (url.pathname.endsWith('/runs/search'))
        return json({ items: [searchedRun({ loss: 1, accuracy: 0.5 })], nextCursor: null });
      if (url.pathname.endsWith('/sweeps/sweep-300')) return json(sweep);
      if (url.pathname.endsWith('/sweeps/sweep-300/trials'))
        return json({ items: runSets['sweep-300'].slice(0, 50).map(sweepTrial), nextCursor: null });
      if (url.pathname.endsWith('/runs/compare')) return json(metricComparison);
      return route.fulfill({ status: 404, contentType: 'application/json', body: '{"error":"not mocked","code":"not_found"}' });
    },
  );
}

async function openHarness(query) {
  const context = await browser.newContext({ locale: 'ja-JP', viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await routeApi(page);
  await page.goto(`${base}/tests/fixtures/analysis-harness.html?${query}`);
  return { context, page, errors };
}

async function screenshot(page, name) {
  if (screenshotDirectory) await page.screenshot({ path: `${screenshotDirectory}/${name}.png`, fullPage: true });
}

async function selectionCount(page) {
  const textContent = await page.getByTestId('parallel-selection-count').textContent();
  const match = textContent.match(/(\d+) 件中 (\d+) 件/);
  return { total: Number(match[1]), selected: Number(match[2]) };
}

async function dragOnAxis(page, axisKey, fromShare, toShare) {
  const box = await page.getByTestId(`parallel-axis-${axisKey}`).boundingBox();
  const x = box.x + box.width / 2;
  await page.mouse.move(x, box.y + box.height * fromShare);
  await page.mouse.down();
  await page.mouse.move(x, box.y + box.height * toShare, { steps: 5 });
  await page.mouse.up();
}

const results = {};
try {
  // 300件のRun。ブラッシング、Runの一覧での選択、重要度の並べ替え、散布図からの移動。
  {
    const { context, page, errors } = await openHarness('experimentId=exp-300');
    await page.getByTestId('parallel-selection-count').waitFor();
    assert.deepEqual(await selectionCount(page), { total: SMALL_RUN_COUNT, selected: SMALL_RUN_COUNT });
    // 既定の軸は重要度の順。lr、optimizer、dropout、batch_size、最後に目的metric。
    const axisKeys = await page.locator('.parallel-axis').evaluateAll((nodes) => nodes.map((node) => node.dataset.axisKey));
    assert.deepEqual(axisKeys, ['params.lr', 'params.optimizer', 'params.dropout', 'params.batch_size', 'metrics.accuracy']);
    await screenshot(page, '01-parallel-300');

    await dragOnAxis(page, 'params.lr', 0.1, 0.45);
    const brushed = await selectionCount(page);
    assert.ok(brushed.selected > 0 && brushed.selected < SMALL_RUN_COUNT, `brush kept ${brushed.selected}`);
    await page.waitForFunction(
      (expected) => document.querySelector('[data-testid="run-list-selection"]')?.dataset.count === String(expected),
      brushed.selected,
    );
    await dragOnAxis(page, 'metrics.accuracy', 0.5, 1.0);
    const twoBrushes = await selectionCount(page);
    assert.ok(twoBrushes.selected > 0 && twoBrushes.selected <= brushed.selected, `second brush kept ${twoBrushes.selected}`);
    await page.getByTestId('analysis-selected-runs').waitFor();
    await screenshot(page, '02-parallel-brushed');
    results.brushing = { afterFirstBrush: brushed.selected, afterSecondBrush: twoBrushes.selected };

    // 軸を動かしてもブラシは残る。軸をクリックすると、その軸のブラシを消す。
    await page.getByRole('button', { name: 'lr: 右へ移動' }).click();
    const movedKeys = await page.locator('.parallel-axis').evaluateAll((nodes) => nodes.map((node) => node.dataset.axisKey));
    assert.equal(movedKeys[1], 'params.lr');
    assert.equal((await selectionCount(page)).selected, twoBrushes.selected);
    await page.getByRole('button', { name: '絞り込みを解除' }).click();
    assert.equal((await selectionCount(page)).selected, SMALL_RUN_COUNT);
    await page.waitForFunction(
      (expected) => document.querySelector('[data-testid="run-list-selection"]')?.dataset.count === String(expected),
      SMALL_RUN_COUNT,
    );

    // lrを対数軸にすると（値はすべて正）、目盛りが10のべき乗の表記になる。
    await page.getByRole('checkbox', { name: 'lr: 対数' }).check();
    const ticks = await page.locator('[data-axis-key="params.lr"] .parallel-axis-tick').allTextContents();
    assert.ok(ticks.some((tick) => tick.includes('e-')), `log ticks ${ticks.join(',')}`);

    await page.getByRole('tab', { name: 'パラメータ重要度' }).click();
    await page.locator('.importance-table tbody tr').first().waitFor();
    const paramOrder = () => page.locator('.importance-table tbody tr').evaluateAll((rows) => rows.map((row) => row.dataset.param));
    assert.deepEqual(await paramOrder(), ['lr', 'optimizer', 'dropout', 'batch_size']);
    await page.getByRole('button', { name: '値のある割合', exact: true }).click();
    assert.equal((await paramOrder()).at(-1), 'dropout', 'descending coverage puts the partly covered param last');
    await page.getByRole('button', { name: 'パラメータ', exact: true }).click();
    assert.deepEqual(await paramOrder(), ['batch_size', 'dropout', 'lr', 'optimizer']);
    await page.getByRole('radio', { name: '並べ替え（permutation）', exact: true }).check();
    await page.getByRole('button', { name: '重要度', exact: true }).click();
    assert.deepEqual(await paramOrder(), ['lr', 'optimizer', 'batch_size', 'dropout']);
    await page.getByText('計算から除いたparam (1)').waitFor();
    await screenshot(page, '03-importance-sorted');

    await page.getByRole('tab', { name: '散布図' }).click();
    await page.locator('.scatter-point').first().waitFor();
    assert.equal(await page.locator('.scatter-point').count(), SMALL_RUN_COUNT);
    await screenshot(page, '04-scatter');
    const point = page.locator('.scatter-point').nth(10);
    const clickedRunId = await point.getAttribute('data-run-id');
    await point.click({ force: true });
    assert.equal(await page.getByTestId('run-detail').textContent(), clickedRunId);
    results.scatterOpenedRun = clickedRunId;

    // 読み取りのendpointだけを使うので、Viewerでもパネルが動く（APIはどれもViewerに許している）。
    const writes = apiRequests.filter((line) => !/(\/runs\/analysis\/|\/runs\/search|\/runs\/compare|^GET )/.test(line));
    assert.deepEqual(writes, []);
    assert.deepEqual(errors, []);
    await context.close();
  }

  // Sweepでは、Sweepのobjectiveが目的metricの既定になり、専用の軸を持つ。
  {
    const { context, page, errors } = await openHarness('sweepId=sweep-300');
    await page.getByTestId('parallel-selection-count').waitFor();
    assert.match(await page.getByLabel('目的metric').inputValue(), /^$/);
    const axisKeys = await page.locator('.parallel-axis').evaluateAll((nodes) => nodes.map((node) => node.dataset.axisKey));
    assert.equal(axisKeys.at(-1), 'objective');
    await page.getByRole('tab', { name: 'パラメータ重要度' }).click();
    await page.getByText('Sweep試行の集約済みの目的値').waitFor();
    await screenshot(page, '05-sweep-importance');
    assert.deepEqual(errors, []);
    await context.close();
  }

  // 5000件のRun。線はcanvasに描き、ドラッグの各回が決めた時間内に応答する。
  {
    const { context, page, errors } = await openHarness('experimentId=exp-5000&theme=dark');
    await page.getByTestId('parallel-selection-count').waitFor({ timeout: 30_000 });
    assert.equal(await page.locator('.parallel-chart-canvas').count(), 1);
    const box = await page.getByTestId('parallel-axis-params.lr').boundingBox();
    const x = box.x + box.width / 2;
    await page.mouse.move(x, box.y + box.height * 0.1);
    await page.mouse.down();
    const stepTimes = [];
    for (let step = 1; step <= DRAG_STEPS; step += 1) {
      const started = Date.now();
      await page.mouse.move(x, box.y + box.height * (0.1 + step * 0.04));
      await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      stepTimes.push(Date.now() - started);
    }
    await page.mouse.up();
    const brushed = await selectionCount(page);
    assert.ok(brushed.selected > 0 && brushed.selected < LARGE_RUN_COUNT);
    const slowest = Math.max(...stepTimes);
    results.largeDrag = { runs: LARGE_RUN_COUNT, stepTimesMs: stepTimes, slowestMs: slowest, selected: brushed.selected };
    assert.ok(slowest <= DRAG_STEP_BUDGET_MS, `slowest drag step ${slowest}ms`);
    await screenshot(page, '06-parallel-5000-dark');
    assert.deepEqual(errors, []);
    await context.close();
  }
  console.log(JSON.stringify({ ok: true, ...results }, null, 2));
} finally {
  await browser.close();
}
