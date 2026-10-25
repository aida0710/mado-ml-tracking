/** ワークフローの作成、CPUでの実行、バージョンの編集、品質による停止、狭い画面の配置を確かめる。 */
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const modulePath = process.env.MMT_PLAYWRIGHT_MODULE;
if (!modulePath) throw new Error('MMT_PLAYWRIGHT_MODULE is required');
const { chromium } = await import(pathToFileURL(modulePath).href);
const base = 'http://127.0.0.1:47161';
const summary = JSON.parse(await readFile('var/workflow-verification/summary.json', 'utf8'));
const project = `${base}/projects/${summary.projectId}`;
const projectApi = `${base}/api/projects/${summary.projectId}`;
const verificationDate = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Tokyo',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
}).format(new Date());
const artifacts = path.resolve(`artifacts/workflows/${verificationDate}`);
await mkdir(artifacts, { recursive: true });
// パイプラインの起動ではローカルのPython環境を入れるので、別に有限の期限を設ける。
const EXECUTION_DEADLINE_MS = 180_000;
const EXECUTION_POLL_MS = 500;
const browser = await chromium.launch({
  headless: true,
  ...(process.env.MMT_CHROMIUM_PATH ? { executablePath: process.env.MMT_CHROMIUM_PATH } : {}),
});
const page = await browser.newPage({ viewport: { width: 1440, height: 1080 }, locale: 'ja-JP' });
const pageErrors = [];
page.on('pageerror', (error) => pageErrors.push(error.message));
async function api(resource) {
  const response = await page.request.get(`${projectApi}/${resource}`);
  assert.ok(response.ok(), `${resource}: HTTP ${response.status()}`);
  return response.json();
}
async function waitForExecution(id, expectedStatus) {
  const deadline = Date.now() + EXECUTION_DEADLINE_MS;
  while (Date.now() < deadline) {
    const execution = await api(`workflow-executions/${id}`);
    if (['finished', 'failed', 'canceled'].includes(execution.status)) {
      assert.equal(
        execution.status,
        expectedStatus,
        execution.error ?? 'Unexpected terminal status',
      );
      return execution;
    }
    await page.waitForTimeout(EXECUTION_POLL_MS);
  }
  throw new Error(`Workflow ${id} did not finish before the deadline`);
}
async function choose(container, label, option) {
  await container.getByRole('combobox', { name: label, exact: true }).click();
  await container.getByRole('option', { name: option, exact: true }).click();
}
/** Starts the shown version: the button opens a confirmation, and its 実行する sends the start. */
async function startWorkflow() {
  await page.getByRole('button', { name: 'ワークフローを実行', exact: true }).click();
  await page
    .getByRole('dialog', { name: 'ワークフローを実行' })
    .getByRole('button', { name: '実行する', exact: true })
    .click();
}
async function mutationResponse(resource, method, click) {
  const responsePromise = page.waitForResponse(
    (response) => response.url().endsWith(resource) && response.request().method() === method,
  );
  await click();
  const response = await responsePromise;
  assert.ok(response.ok(), `${method} ${resource}: HTTP ${response.status()}`);
  return response.json();
}
try {
  const login = await page.request.post(`${base}/api/auth/dev-login`, {
    headers: { Origin: base },
    data: { email: 'admin@localhost' },
  });
  assert.ok(login.ok());
  const cpu = await waitForExecution(summary.executionId, 'finished');
  assert.deepEqual(
    cpu.steps.map((step) => step.status),
    ['finished', 'finished', 'finished'],
  );
  assert.equal(cpu.steps[0].preprocessingReport.inputCount, 10);
  assert.equal(cpu.steps[0].preprocessingReport.outputCount, 8);
  assert.equal(cpu.steps[1].metrics['train.records'], 8);
  assert.equal(cpu.steps[2].metrics['evaluation.score'], 0.9);
  assert.equal(cpu.steps[1].outputModelVersionIds.length, 1);
  await page.goto(`${project}/workflows/${summary.workflowId}?execution=${cpu.id}`);
  await page.getByRole('heading', { name: '前処理レポート', exact: true }).waitFor();
  await page.screenshot({ path: path.join(artifacts, 'workflow-desktop.png'), fullPage: true });

  await page.goto(`${project}/workflows`);
  await page.getByRole('button', { name: 'ワークフローを作成', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('名前', { exact: true }).fill('画面から作った前処理と学習');
  let step = dialog.locator('.workflow-step-editor').first();
  await choose(step, 'Task', '音声の前処理・データ処理・v1');
  await dialog.getByRole('button', { name: 'ステップを追加', exact: true }).click();
  step = dialog.locator('.workflow-step-editor').nth(1);
  await choose(step, 'Task', '音声の学習・学習・v1');
  await step.getByRole('button', { name: '入力を追加', exact: true }).click();
  const input = step.locator('.workflow-input');
  await choose(input, '入力元', '前のステップの出力');
  await choose(input, '出力元のステップ', '音声の前処理');
  await choose(input, '用途', '学習');
  await input.getByLabel('混合比率の重み', { exact: true }).fill('2');
  await input.getByRole('textbox', { name: '抽出条件（JSON）', exact: true }).fill('{"seed":42}');
  const created = await mutationResponse(
    `/api/projects/${summary.projectId}/workflows`,
    'POST',
    () => dialog.getByRole('button', { name: '保存', exact: true }).click(),
  );
  await page.waitForURL(`**/workflows/${created.workflow.id}`);
  const launched = await mutationResponse(`/workflows/${created.workflow.id}/launch`, 'POST', () =>
    startWorkflow(),
  );
  await waitForExecution(launched.id, 'finished');

  await page.getByRole('button', { name: '新しいバージョンを作成', exact: true }).click();
  await dialog
    .locator('.workflow-step-editor')
    .first()
    .getByRole('button', { name: '品質条件を追加', exact: true })
    .click();
  const version = await mutationResponse(`/workflows/${created.workflow.id}/versions`, 'POST', () =>
    dialog.getByRole('button', { name: '保存', exact: true }).click(),
  );
  assert.equal(version.revision, 2);
  await page
    .getByRole('combobox', { name: 'ワークフローのバージョン', exact: true })
    .getByText('v2', { exact: true })
    .waitFor();
  const stopped = await mutationResponse(`/workflows/${created.workflow.id}/launch`, 'POST', () =>
    startWorkflow(),
  );
  const failed = await waitForExecution(stopped.id, 'failed');
  assert.equal(failed.steps[1].jobId, null);
  assert.match(failed.error, /preprocessing.retained_input_ratio/);
  await page.reload();
  await page.getByRole('button', { name: '新しい実行として再開', exact: true }).waitFor();
  await page.screenshot({
    path: path.join(artifacts, 'workflow-quality-stop.png'),
    fullPage: true,
  });

  await page.goto(`${project}/workflows/${summary.workflowId}?execution=${cpu.id}`);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('heading', { name: '前処理レポート', exact: true }).waitFor();
  assert.equal(
    await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth),
    false,
  );
  await page.screenshot({ path: path.join(artifacts, 'workflow-mobile.png'), fullPage: true });
  assert.deepEqual(pageErrors, []);
  await writeFile(
    path.join(artifacts, 'verification.json'),
    JSON.stringify(
      {
        cpuExecutionId: cpu.id,
        browserWorkflowId: created.workflow.id,
        browserExecutionId: launched.id,
        qualityStopExecutionId: failed.id,
        inputCount: 10,
        outputCount: 8,
        trainedRecords: 8,
        evaluationScore: 0.9,
        mobileWidth: 390,
        pageErrors,
      },
      null,
      2,
    ),
  );
  console.log(JSON.stringify({ result: 'passed', artifacts }));
} catch (error) {
  await page.screenshot({ path: path.join(artifacts, 'failure.png'), fullPage: true });
  console.error(
    JSON.stringify({ pageErrors, visibleText: await page.locator('body').innerText() }),
  );
  throw error;
} finally {
  await browser.close();
}
