// 見本のProject（開発用のログイン）のドキュメント用スクリーンショットを、serve-environment.mjsが
// 起動し、seed_sample_project.pyがデータを入れた環境で撮る。
//   node pages/scripts/screenshots/capture-sample-project.mjs [--lang en] [name ...]
// 何も保存せず、作りもしない。ダイアログは開いて入力し、閉じる。
import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { launchBrowser, newDocsContext, signInForDevelopment } from './browserSession.mjs';
import { labelsFor } from './labels.mjs';
import { outputDirectory, saveScreenshot } from './publishableScreenshot.mjs';
import { runCaptures } from './runCaptures.mjs';
import { parseArguments, readEnvironment, readSeedState } from './screenshotEnvironment.mjs';

// 図（canvas）と音声の解析は、ネットワークが落ち着いた後も描画を続ける。
const RENDER_SETTLE_MS = 1500;
// クリックで開いたパネルやダイアログ、選択で絞り込んだ一覧が表示し終わるまで。
const SHORT_SETTLE_MS = 800;
// スムーズスクロールと、追従する見出しが落ち着くまで。
const SCROLL_SETTLE_MS = 500;

const { options, positional: only } = parseArguments(process.argv.slice(2));
const { lang } = options;
const label = labelsFor(lang);
const { webUrl, artifactsDirectory } = await readEnvironment(lang, 'sample');
const state = await readSeedState(lang, 'sample', 'seed-state.json');
const { names } = state;
const projectPath = `/projects/${state.projectId}`;
const firstTrainingRun = state.round1.trainingRunId;
const secondTrainingRun = state.round2.trainingRunId;
const versionPath = `${projectPath}/models/${state.modelId}/versions/${state.round2.versionId}`;
const dataRunArtifacts = `${projectPath}/runs/${state.dataRunId}?tab=artifacts`;
const trainingExperiment = `${projectPath}/experiments?experiment=${state.experiments.training}`;

const browser = await launchBrowser();
const directory = await outputDirectory(lang);
const context = await newDocsContext(browser, { lang });
await signInForDevelopment(context, webUrl);
const page = await context.newPage();

async function apiGet(resource) {
  const response = await context.request.get(`${webUrl}/api/${resource}`);
  if (!response.ok()) throw new Error(`GET ${resource}: ${response.status()}`);
  return response.json();
}

// 画面に出るこの環境のローカルのパスと、ドキュメントで代わりに見せるパス。
const sampleComputer = (await apiGet('targets')).items.find((target) => target.id === state.targetId);
const replacements = [
  [artifactsDirectory, '/srv/mmt/artifacts'],
  [state.archiveDirectory, '/srv/mmt/archive'],
  [state.jobsDirectory, '/srv/mmt/jobs'],
  // workerのPythonの仮想環境（bin/python、lib/.../pip）。
  [path.dirname(path.dirname(sampleComputer.pythonExecutable)), '/opt/mmt/venv'],
];

async function open(route) {
  await page.goto(webUrl + route);
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(RENDER_SETTLE_MS);
}

async function scrollToHeading(name, offset = 24) {
  await page
    .getByRole('heading', { name, exact: true })
    .first()
    .evaluate((element, top) => {
      element.scrollIntoView({ block: 'start' });
      window.scrollBy(0, -top);
    }, offset);
  await page.waitForTimeout(SCROLL_SETTLE_MS);
}

async function dragAcross(locator, fromRatio, toRatio) {
  const box = await locator.boundingBox();
  const y = box.y + box.height / 2;
  await page.mouse.move(box.x + box.width * fromRatio, y);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * toRatio, y, { steps: 10 });
  await page.mouse.up();
}

async function openModelsTab(tabName) {
  await open(`${projectPath}/models`);
  await page.getByRole('tab', { name: tabName }).click();
  await page.waitForTimeout(RENDER_SETTLE_MS);
}

const sweepResponse = await context.request.post(`${webUrl}/api/projects/${state.projectId}/runs/search`, {
  data: { experimentIds: [state.experiments.sweep], limit: 50 },
});
if (!sweepResponse.ok()) throw new Error(`Run search: ${sweepResponse.status()}`);
const sweepRuns = (await sweepResponse.json()).items;
if (sweepRuns.length === 0) throw new Error('the sample Sweep has no Runs');
const finishedSweepRuns = sweepRuns.filter((run) => run.status === 'finished').map((run) => run.id);
const otherSweepRuns = sweepRuns.filter((run) => run.status !== 'finished').map((run) => run.id);

const captures = {
  // はじめる
  'guide-runs': () => open(trainingExperiment),
  'guide-model-version': () => open(versionPath),
  'guide-model-version-automation': async () => {
    await open(versionPath);
    await scrollToHeading(label.modelVersionLineage, 8);
  },
  'guide-mlflow-connection': async () => {
    await open(`${projectPath}/settings`);
    await page.getByRole('tab', { name: 'MLflow 3', exact: true }).click();
    await scrollToHeading(label.recordingConnection, 8);
  },
  // 実験の記録と分析
  'tracking-runs': () => open(trainingExperiment),
  'tracking-runs-search': () => open(`${projectPath}/experiments?q=${encodeURIComponent('metrics.val_loss < 0.1')}`),
  'tracking-saved-views': async () => {
    await open(`${projectPath}/experiments?view=${state.savedViewId}&experiment=${state.experiments.training}`);
    await page.locator('details.saved-views-menu > summary').click();
    await page.waitForTimeout(SHORT_SETTLE_MS);
  },
  'tracking-run-metrics': () => open(`${projectPath}/runs/${secondTrainingRun}?tab=metrics`),
  'tracking-system-metrics': () => open(`${projectPath}/runs/${secondTrainingRun}?tab=systemMetrics`),
  'tracking-charts': () => open(`${trainingExperiment}&charts=1`),
  'tracking-chart-editor': async () => {
    await open(`${trainingExperiment}&charts=1`);
    await page.getByRole('button', { name: label.editChart }).first().click();
    await page.waitForTimeout(SHORT_SETTLE_MS);
  },
  'tracking-media': () => open(`${projectPath}/runs/${secondTrainingRun}?tab=media`),
  'tracking-media-compare': async () => {
    await open(`${projectPath}/compare?runs=${firstTrainingRun},${secondTrainingRun}&tab=media`);
    const select = page.locator('select').filter({ hasText: 'samples/tone' }).first();
    const value = await select.locator('option', { hasText: 'samples/tone' }).first().getAttribute('value');
    await select.selectOption(value);
    await page.waitForTimeout(SHORT_SETTLE_MS);
    await page.getByRole('button', { name: label.mediaCompareEvenly }).click();
    await page.waitForTimeout(RENDER_SETTLE_MS);
  },
  'tracking-comments': async () => {
    await open(`${projectPath}/runs/${secondTrainingRun}?tab=details`);
    await scrollToHeading(label.comments, 40);
  },
  'tracking-notes': () => open(`${projectPath}/runs/${secondTrainingRun}?tab=details`),
  'tracking-compare': async () => {
    const runs = [...finishedSweepRuns, ...otherSweepRuns.slice(0, 2)];
    await open(`${projectPath}/compare?runs=${runs.join(',')}&baseline=${finishedSweepRuns[0]}`);
    await page.mouse.wheel(0, 380);
    await page.waitForTimeout(SHORT_SETTLE_MS);
  },
  'tracking-compare-analysis': () =>
    open(`${projectPath}/compare?runs=${sweepRuns.map((run) => run.id).join(',')}&tab=analysis`),
  'tracking-sweeps': () => open(`${projectPath}/sweeps`),
  'tracking-sweep-detail': () => open(`${projectPath}/sweeps/${state.sweepId}`),
  'tracking-mlflow-connection': async () => {
    await open(`${projectPath}/settings`);
    await page.getByRole('tab', { name: 'MLflow 3', exact: true }).click();
    await scrollToHeading(label.recordingConnection, 24);
  },
  // データと保存先
  'data-artifacts-run': async () => {
    await open(dataRunArtifacts);
    await page.getByText('data', { exact: true }).first().click();
    await page.waitForTimeout(SHORT_SETTLE_MS);
    await page.getByText('vowel-a.wav', { exact: true }).click();
    await page.waitForTimeout(RENDER_SETTLE_MS);
  },
  'data-artifacts-browser': async () => {
    await open(`${projectPath}/artifacts?runId=${state.dataRunId}`);
    await page.getByText('data/vowel-e.wav', { exact: true }).click();
    await page.waitForTimeout(RENDER_SETTLE_MS);
  },
  'data-uploads-dialog': async () => {
    await open(dataRunArtifacts);
    await page.getByRole('button', { name: label.uploadArtifact }).click();
    await page.waitForTimeout(SCROLL_SETTLE_MS);
    const files = (await readdir(state.audioSampleDirectory)).map((name) => path.join(state.audioSampleDirectory, name));
    // ファイルを選ぶだけで、アップロードは始めない。
    await page.locator('input[type=file]').first().setInputFiles(files);
    await page.waitForTimeout(SHORT_SETTLE_MS);
  },
  'data-audio-viewer': async () => {
    await open(dataRunArtifacts);
    await page.getByText('data', { exact: true }).first().click();
    await page.waitForTimeout(SHORT_SETTLE_MS);
    await page.getByText('vowel-o.wav', { exact: true }).click();
    await page.waitForTimeout(RENDER_SETTLE_MS);
    await page.getByLabel(label.audioSpectrogramScale).selectOption({ label: label.audioScaleMel });
    await page.waitForTimeout(SHORT_SETTLE_MS);
    await dragAcross(page.locator('canvas').first(), 0.3, 0.6);
    await page.waitForTimeout(RENDER_SETTLE_MS);
  },
  'data-datasets': async () => {
    await open(`${projectPath}/datasets`);
    await page.getByText(names.audioDataset, { exact: true }).first().click();
    await page.waitForTimeout(RENDER_SETTLE_MS);
  },
  'data-storage': () => open('/settings/storage'),
  'data-reports': () => open(`${projectPath}/reports/${state.reportId}`),
  // モデルと自動実行
  'models-registry': async () => {
    await open(`${projectPath}/models`);
    await page.getByText('voice-tts-demo', { exact: true }).first().click();
    await page.waitForTimeout(SHORT_SETTLE_MS);
  },
  'models-version': () => open(versionPath),
  'models-version-evaluation': async () => {
    await open(versionPath);
    await scrollToHeading(label.evaluationResults, 200);
  },
  'models-lineage': () => open(`${projectPath}/lineage`),
  'models-tasks': async () => {
    await open(`${projectPath}/tasks`);
    await page.getByText(names.trainingTask, { exact: true }).first().click();
    await page.waitForTimeout(SHORT_SETTLE_MS);
  },
  'models-code-editor': async () => {
    await open(`${projectPath}/codes`);
    await page.getByRole('button', { name: names.trainingCode, exact: true }).first().click();
    await page.waitForTimeout(SHORT_SETTLE_MS);
    // 新しいバージョンを作るダイアログを開くだけで、保存はしない。
    await page.getByRole('button', { name: label.newVersion, exact: true }).first().click();
    await page.waitForTimeout(RENDER_SETTLE_MS);
    await page.getByRole('dialog').getByText('voice_training.py', { exact: true }).first().click();
    await page.waitForTimeout(SHORT_SETTLE_MS);
  },
  'models-automation-rules': async () => {
    await openModelsTab(label.automationRules);
    await page.getByText(names.evaluationRule, { exact: true }).first().click();
    await page.waitForTimeout(SHORT_SETTLE_MS);
  },
  'models-automation-history': () => openModelsTab(label.automationHistory),
  'models-promotion-policies': () => openModelsTab(label.promotionPolicies),
  'models-promotion-dialog': async () => {
    await open(`${projectPath}/models`);
    await page.getByText('voice-tts-demo', { exact: true }).first().click();
    await page.waitForTimeout(SHORT_SETTLE_MS);
    await page.getByRole('button', { name: label.assignAlias }).first().click();
    await page.waitForTimeout(SHORT_SETTLE_MS);
    // alias欄にフォーカスがあると既存のaliasが並ぶ。ドキュメントでは空のフォームを見せる。
    await page.evaluate(() => document.activeElement?.blur());
  },
  // 実行環境
  'compute-targets': () => open(`${projectPath}/compute`),
  'compute-target-check': async () => {
    // seedが実行した確認の結果を開く。「接続を確認」は押さない。
    await open('/settings/computers');
    await page.getByRole('button', { name: names.computer, exact: true }).first().click();
    await page.waitForTimeout(SHORT_SETTLE_MS);
    await scrollToHeading(`${label.targetCheck}: ${names.computer}`, 24);
  },
  // 管理と権限（Projectの設定）
  'admin-permissions': async () => {
    await open(`${projectPath}/settings`);
    await scrollToHeading(label.members, 72);
  },
  'admin-service-accounts': async () => {
    await open(`${projectPath}/settings`);
    await scrollToHeading(label.serviceAccounts, 72);
  },
  'admin-notifications': async () => {
    await open(`${projectPath}/settings`);
    await scrollToHeading(label.notifications, 72);
  },
  'admin-audit': async () => {
    await open(`${projectPath}/settings`);
    await scrollToHeading(label.auditEvents, 72);
  },
};

try {
  await runCaptures(captures, only, async (name, prepare) => {
    try {
      await prepare();
      await saveScreenshot(page, directory, name, { lang, replacements, maskTokens: true });
    } finally {
      await page.keyboard.press('Escape');
    }
  });
} finally {
  await browser.close();
}
