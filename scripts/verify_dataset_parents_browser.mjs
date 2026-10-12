/** Verifies parent corrections against the isolated API, including existing model lineage. */
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const modulePath = process.env.MMT_PLAYWRIGHT_MODULE;
if (!modulePath) throw new Error('MMT_PLAYWRIGHT_MODULE is required');
const { chromium } = await import(pathToFileURL(modulePath).href);
const base = process.env.MMT_WEB_URL ?? 'http://127.0.0.1:5984';
if (new URL(base).hostname !== '127.0.0.1')
  throw new Error('Requires the isolated loopback server');
const directory = path.resolve(
  process.env.MMT_VERIFICATION_DIR ?? 'artifacts/verification/2026-10-12/dataset-version-parents',
);
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
async function json(response) {
  assert.ok(response.ok(), `HTTP ${response.status()}`);
  return response.json();
}
async function fitsViewport() {
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
}
try {
  await json(
    await context.request.post(`${base}/api/auth/dev-login`, {
      headers: { Origin: base },
      data: { email: 'editor@localhost' },
    }),
  );
  const snapshots = await Promise.all(
    fixture.runs.map((id) => context.request.get(`${api}/runs/${id}`).then(json)),
  );
  await page.goto(`${project}/datasets?version=${fixture.features.id}`);
  await page.getByRole('button', { name: '親データ版を追加', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('checkbox', { name: /加工音声32tar/ }).check();
  await dialog
    .getByLabel('親を追加する理由')
    .fill('保存済みの設定と32tarのSHA-256を照合し、欠けた生成元を補足');
  await dialog
    .getByLabel('照合根拠（JSON）')
    .fill('{"archive_count":32,"comparison":"saved-config-and-sha256"}');
  const response = page.waitForResponse(
    (item) => item.url().endsWith('/parents') && item.request().method() === 'POST',
  );
  await dialog.getByRole('button', { name: '親データ版を追加', exact: true }).click();
  const history = await json(await response);
  assert.deepEqual(history.registeredParentDatasetVersionIds, []);
  assert.deepEqual(history.parentDatasetVersionIds, [fixture.audio.id]);
  await dialog.waitFor({ state: 'hidden' });
  const panel = page.getByRole('region', { name: '親の追記履歴', exact: true });
  await panel.getByRole('link', { name: /加工音声32tar/ }).waitFor();
  await panel.getByText(history.items[0].createdByName, { exact: true }).waitFor();
  await page.screenshot({
    path: path.join(directory, 'dataset-parent-history.png'),
    fullPage: true,
  });
  const read = await json(
    await context.request.get(`${api}/datasets/${fixture.features.datasetId}/versions`),
  );
  assert.deepEqual(
    read.items.find((item) => item.id === fixture.features.id),
    { ...fixture.features, parentDatasetVersionIds: [fixture.audio.id] },
  );
  for (const [index, id] of fixture.runs.entries()) {
    assert.deepEqual(await json(await context.request.get(`${api}/runs/${id}`)), snapshots[index]);
    assert.deepEqual(
      (await json(await context.request.get(`${api}/runs/${id}/training-data-stages`))).items,
      [],
    );
  }
  await page.goto(`${project}/models/${fixture.modelId}/versions/${fixture.modelVersionId}`);
  await page.getByRole('link', { name: /加工音声32tar/ }).waitFor();
  await page.screenshot({
    path: path.join(directory, 'model-parent-lineage.png'),
    fullPage: false,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${project}/datasets?version=${fixture.features.id}`);
  await page
    .getByRole('region', { name: '親の追記履歴', exact: true })
    .getByRole('link', { name: /加工音声32tar/ })
    .waitFor();
  await fitsViewport();
  await page.getByRole('button', { name: '親データ版を追加', exact: true }).click();
  await page.getByRole('dialog').getByLabel('親を追加する理由').waitFor();
  await fitsViewport();
  await page.screenshot({
    path: path.join(directory, 'dataset-parent-narrow.png'),
    fullPage: true,
  });
  await page.getByRole('dialog').getByRole('button', { name: 'キャンセル', exact: true }).click();
  await json(
    await context.request.post(`${base}/api/auth/dev-login`, {
      headers: { Origin: base },
      data: { email: 'viewer@localhost' },
    }),
  );
  await page.reload();
  await page
    .getByRole('region', { name: '親の追記履歴', exact: true })
    .getByRole('link', { name: /加工音声32tar/ })
    .waitFor();
  assert.equal(
    await page.getByRole('button', { name: '親データ版を追加', exact: true }).count(),
    0,
  );
  assert.deepEqual(errors, []);
  await writeFile(
    path.join(directory, 'browser-summary.json'),
    JSON.stringify(
      {
        correctionHistory: 'passed',
        immutableVersion: 'passed',
        twelveRunInputs: 'preserved',
        trainingStageRecords: 'unchanged',
        modelAncestorLineage: 'passed',
        narrowViewport: 'passed',
        viewer: 'passed',
        errors,
      },
      null,
      2,
    ),
  );
  console.log('Dataset parent browser checks passed');
} finally {
  await browser.close();
}
