/** Checks the training provenance UI against the isolated native API, without production data. */
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const modulePath = process.env.MMT_PLAYWRIGHT_MODULE;
if (!modulePath) throw new Error('MMT_PLAYWRIGHT_MODULE is required');
const { chromium } = await import(pathToFileURL(modulePath).href);
const base = process.env.MMT_WEB_URL ?? 'http://127.0.0.1:5982';
if (new URL(base).hostname !== '127.0.0.1')
  throw new Error('Verification requires the isolated loopback server');
const verificationDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo' }).format(
  new Date(),
);
const directory = path.resolve(
  process.env.MMT_VERIFICATION_DIR ??
    `artifacts/verification/${verificationDate}/model-training-sources`,
);
await mkdir(directory, { recursive: true });
const fixture = JSON.parse(await readFile(path.join(directory, 'browser-fixture.json'), 'utf8'));
const project = `${base}/projects/${fixture.projectId}`;
const api = `${base}/api/projects/${fixture.projectId}`;
const browser = await chromium.launch({
  headless: true,
  ...(process.env.MMT_CHROMIUM_PATH ? { executablePath: process.env.MMT_CHROMIUM_PATH } : {}),
});
const context = await browser.newContext({
  locale: 'ja-JP',
  timezoneId: 'Asia/Tokyo',
  viewport: { width: 1440, height: 1040 },
});
const page = await context.newPage();
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));

async function jsonResponse(response) {
  assert.ok(response.ok(), `HTTP ${response.status()}: ${await response.text()}`);
  return response.json();
}

async function mutation(suffix, action) {
  const response = page.waitForResponse(
    (item) => item.url().endsWith(suffix) && item.request().method() === 'POST',
  );
  await action();
  return jsonResponse(await response);
}

async function fitsViewport() {
  assert.equal(
    await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth),
    false,
  );
}

try {
  await jsonResponse(
    await context.request.post(`${base}/api/auth/dev-login`, {
      headers: { Origin: base },
      data: { email: 'editor@localhost' },
    }),
  );
  await page.goto(`${project}/models/${fixture.modelId}/versions/${fixture.versionId}`);
  await page.getByRole('button', { name: '学習元を紐付け', exact: true }).click();
  let dialog = page.getByRole('dialog');
  await dialog.getByRole('combobox', { name: '学習記録', exact: true }).click();
  await dialog.getByRole('option', { name: '過去の学習を記録する', exact: true }).click();
  await dialog.getByLabel('Run名').fill('過去の事前学習・登録済みモデル');
  await dialog.getByLabel('Experiments').selectOption(fixture.experimentId);
  await dialog.getByRole('checkbox', { name: /事前学習の元データ/ }).check();
  await dialog
    .getByLabel('根拠・メモ', { exact: true })
    .fill('保存済みの学習設定とデータの版を照合しました。');
  const source = await mutation('/training-source', () =>
    dialog.getByRole('button', { name: '学習元を紐付け', exact: true }).click(),
  );
  await dialog.waitFor({ state: 'hidden' });
  const trainingSource = page.getByRole('region', { name: '学習元', exact: true });
  await trainingSource.getByRole('link', { name: /事前学習の元データ/ }).waitFor();
  const version = await jsonResponse(
    await context.request.get(`${api}/models/${fixture.modelId}/versions/${fixture.versionId}`),
  );
  assert.equal(version.sourceRunId, null);
  assert.equal(version.trainingSourceRunId, source.runId);
  assert.equal(version.id, fixture.versionId);
  await page.screenshot({
    path: path.join(directory, 'model-training-source.png'),
    fullPage: false,
  });

  await page.goto(`${project}/runs/${fixture.activeRunId}?tab=trainingData`);
  await page.getByRole('button', { name: 'データの変更を記録', exact: true }).click();
  dialog = page.getByRole('dialog');
  await dialog.getByLabel('このデータを使い始めたstep').fill('1001');
  assert.equal(
    await dialog.getByRole('checkbox', { name: /事前学習の元データ/ }).isChecked(),
    true,
  );
  await dialog.getByRole('checkbox', { name: /追加する合成データ/ }).check();
  await dialog.getByLabel('メモ', { exact: true }).fill('step 1001から合成データを追加');
  const stage = await mutation('/training-data-stages', () =>
    dialog.getByRole('button', { name: 'データの変更を記録', exact: true }).click(),
  );
  assert.equal(stage.startStep, 1001);
  assert.deepEqual([...stage.inputDatasetVersionIds].sort(), [...fixture.datasetIds].sort());
  await dialog.waitFor({ state: 'hidden' });
  await page.getByText('step 1001 以降', { exact: true }).waitFor();
  const run = await jsonResponse(await context.request.get(`${api}/runs/${fixture.activeRunId}`));
  assert.deepEqual(run.inputDatasetVersionIds, [fixture.datasetIds[0]]);
  assert.deepEqual([...run.trainingDatasetVersionIds].sort(), [...fixture.datasetIds].sort());
  await page
    .getByRole('row')
    .filter({ hasText: 'step 1001 以降' })
    .getByRole('link', { name: /追加する合成データ/ })
    .nth(1)
    .waitFor();
  await page.screenshot({
    path: path.join(directory, 'training-data-history.png'),
    fullPage: true,
  });

  await page.goto(`${project}/runs/${fixture.sourceRunId}?tab=checkpoints`);
  const continuation = page.getByRole('button', { name: 'この重みから学習を続ける', exact: true });
  await continuation.click();
  dialog = page.getByRole('dialog');
  await dialog.getByText('step 1000 のcheckpointから学習を続けます。', { exact: false }).waitFor();
  assert.equal(
    await dialog.getByRole('checkbox', { name: /事前学習の元データ/ }).isChecked(),
    true,
  );
  await dialog.getByRole('checkbox', { name: /追加する合成データ/ }).check();
  await page.screenshot({
    path: path.join(directory, 'checkpoint-training-data.png'),
    fullPage: true,
  });
  await dialog.getByRole('button', { name: '次へ', exact: true }).click();
  await dialog.getByLabel('コンピュータ').selectOption(fixture.targetId);
  await dialog.getByRole('button', { name: '次へ', exact: true }).click();
  const launched = await mutation('/jobs/launch', () =>
    dialog.getByRole('button', { name: 'ジョブを起動', exact: true }).click(),
  );
  assert.equal(launched.run.kind, 'training');
  assert.equal(launched.run.parentRunId, fixture.sourceRunId);
  assert.equal(launched.run.resumeCheckpointId, fixture.checkpointId);
  assert.deepEqual([...launched.run.inputDatasetVersionIds].sort(), [...fixture.datasetIds].sort());
  const original = await jsonResponse(
    await context.request.get(`${api}/runs/${fixture.sourceRunId}`),
  );
  assert.equal(original.status, 'finished');
  assert.deepEqual(original.inputDatasetVersionIds, [fixture.datasetIds[0]]);

  await page.setViewportSize({ width: 320, height: 840 });
  await page.goto(`${project}/runs/${fixture.activeRunId}?tab=trainingData`);
  await page.getByText('step 1001 以降', { exact: true }).waitFor();
  await fitsViewport();
  await page.getByRole('button', { name: 'データの変更を記録', exact: true }).click();
  await page.getByRole('dialog').getByLabel('このデータを使い始めたstep').waitFor();
  await fitsViewport();
  await page.screenshot({ path: path.join(directory, 'training-data-narrow.png'), fullPage: true });
  await page.getByRole('dialog').getByRole('button', { name: 'キャンセル', exact: true }).click();
  await jsonResponse(
    await context.request.post(`${base}/api/auth/dev-login`, {
      headers: { Origin: base },
      data: { email: 'viewer@localhost' },
    }),
  );
  await page.reload();
  await page.getByText('step 1001 以降', { exact: true }).waitFor();
  assert.equal(
    await page.getByRole('button', { name: 'データの変更を記録', exact: true }).count(),
    0,
  );
  assert.deepEqual(errors, []);
  await writeFile(
    path.join(directory, 'browser-summary.json'),
    JSON.stringify(
      {
        historicalTrainingSource: 'passed',
        immutableVersion: 'passed',
        trainingDataStages: 'passed',
        continuationFromFinishedPretraining: 'passed',
        originalRunPreserved: 'passed',
        narrowViewport: 'passed',
        viewer: 'passed',
        errors,
      },
      null,
      2,
    ),
  );
  console.log('Training provenance browser checks passed');
} finally {
  await browser.close();
}
