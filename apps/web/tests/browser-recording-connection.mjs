// The guide to recording from the Python SDK and MLflow 3 with a mocked API: on the Project
// settings page it carries the Project's ID, on the Experiments page also the chosen Experiment's
// (the heading's copy button, MMT_EXPERIMENT_ID, set_experiment with its name). The copy buttons
// put the exact values on the clipboard, the token dialog opens with the recording scopes
// selected, and a viewer gets no token button.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { createBrowserApi } from './browserApi.mjs';

const modulePath = process.env.MMT_PLAYWRIGHT_MODULE;
if (!modulePath) throw new Error('Set MMT_PLAYWRIGHT_MODULE to an installed Playwright index.mjs');
const { chromium } = await import(pathToFileURL(modulePath).href);
const base = process.env.MMT_WEB_URL ?? 'http://127.0.0.1:5182';
const outputDirectory = process.env.MMT_SCREENSHOT_DIR;
if (outputDirectory) await mkdir(outputDirectory, { recursive: true });
const RECORDING_SCOPES = ['artifacts:write', 'read', 'registry:write', 'runs:write'];

const browser = await chromium.launch({
  headless: true,
  ...(process.env.MMT_CHROMIUM_PATH ? { executablePath: process.env.MMT_CHROMIUM_PATH } : {}),
  args: ['--no-sandbox'],
});

async function openPage(role, path) {
  const context = await browser.newContext({ locale: 'ja-JP', viewport: { width: 1440, height: 960 } });
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: base });
  const api = createBrowserApi();
  api.state.loggedIn = true;
  api.state.project.role = role;
  // The shared mock's member rows predate group bindings; the settings page needs `groups`.
  const membersPath = `/api/projects/${api.state.project.id}/members`;
  await context.route(
    (url) => url.pathname.startsWith('/api/'),
    (route) => {
      const request = route.request();
      if (new URL(request.url()).pathname === membersPath && request.method() === 'GET')
        return route.fulfill({
          contentType: 'application/json',
          body: JSON.stringify({
            items: [{ user: api.state.user, role, directRole: role, groups: [] }],
          }),
        });
      return api.route(route);
    },
  );
  const page = await context.newPage();
  await page.goto(`${base}/projects/${api.state.project.id}${path(api)}`);
  return { context, page, api };
}

const guideOf = async (page) => {
  const guide = page.locator('section.recording-connection');
  await guide.getByRole('heading', { name: 'SDK・MLflow 3から接続' }).waitFor();
  return guide;
};
const clipboard = (page) => page.evaluate(() => navigator.clipboard.readText());
async function copySnippet(page, scope, label) {
  await scope.locator('.code-snippet', { hasText: label }).getByRole('button', { name: 'コピー' }).click();
  return clipboard(page);
}
async function copyValueOf(page, scope, name) {
  await scope.locator('.connection-values > div', { hasText: name }).getByRole('button').click();
  return clipboard(page);
}

try {
  // Project settings: the Project's ID, the SDK first, then MLflow 3.
  const { context, page, api } = await openPage('admin', () => '/settings');
  const projectId = api.state.project.id;
  const guide = await guideOf(page);
  assert.equal(await copyValueOf(page, guide, 'プロジェクトID'), projectId);
  assert.equal(await guide.locator('.connection-values > div', { hasText: '実験ID' }).count(), 0);
  const sdkEnvironment = await copySnippet(page, guide, '環境変数');
  assert.match(sdkEnvironment, new RegExp(`^export MMT_API_URL=${base}\n`));
  assert.match(sdkEnvironment, new RegExp(`export MMT_PROJECT_ID=${projectId}\n`));
  assert.doesNotMatch(sdkEnvironment, /MMT_EXPERIMENT_ID/);
  assert.match(sdkEnvironment, /printf 'API token: '; read -r -s MMT_API_TOKEN; echo/);
  // Without a chosen Experiment the example names one, which start_run creates when absent.
  assert.match(
    await copySnippet(page, guide, 'Pythonの例'),
    /start_run\(experiment_name="my-experiment", name="first-run"\)/,
  );
  assert.match(
    await copySnippet(page, guide, 'インストール'),
    /pip install 'mado-tracking\[telemetry\] @ git\+https:\/\/github\.com\/aida0710\/mado-ml-tracking\.git#subdirectory=python'/,
  );
  if (outputDirectory) await guide.screenshot({ path: `${outputDirectory}/01-settings-sdk.png` });

  await guide.getByRole('tab', { name: 'MLflow 3' }).click();
  const trackingUri = `${base}/api/mlflow/projects/${projectId}`;
  assert.equal(await copyValueOf(page, guide, 'MLFLOW_TRACKING_URI'), trackingUri);
  const mlflowEnvironment = await copySnippet(page, guide, '環境変数');
  assert.match(mlflowEnvironment, new RegExp(`export MLFLOW_REGISTRY_URI=${trackingUri}\n`));
  assert.match(mlflowEnvironment, /printf 'API token: '; read -r -s MLFLOW_TRACKING_TOKEN; echo/);
  assert.match(await copySnippet(page, guide, 'Pythonの例'), /set_experiment\("my-experiment"\)/);
  const more = guide.locator('details.connection-more');
  assert.equal(await more.getByText('MLFLOW_TRACKING_USERNAME=mado').isVisible(), false);
  await more.locator('summary').click();
  await more.getByText('MLFLOW_TRACKING_USERNAME=mado').waitFor();
  await more.getByText(/長期の自動処理やworkerには、Service Account/).waitFor();
  if (outputDirectory) await guide.screenshot({ path: `${outputDirectory}/02-settings-mlflow.png` });

  await guide.getByRole('button', { name: 'このProject用のAPI tokenを発行' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.waitFor();
  // The guide's button opens the dialog with the recording purpose and its scopes checked.
  assert.equal(
    await dialog.getByRole('radio', { name: 'SDK・MLflow 3から記録する' }).isChecked(),
    true,
  );
  const selected = await dialog
    .locator('.checkbox-list input[type=checkbox]:checked')
    .evaluateAll((elements) =>
      elements.map((element) => element.closest('label').textContent.split(' — ')[0].trim()),
    );
  assert.deepEqual(selected.sort(), RECORDING_SCOPES);
  await dialog.getByLabel('名前').fill('recording-sdk');
  await dialog.getByRole('button', { name: '保存' }).click();
  await dialog.getByText('API tokenは一度だけ表示されます', { exact: false }).waitFor();
  const created = api.state.tokens.at(-1);
  assert.deepEqual([...created.scopes].sort(), RECORDING_SCOPES);
  assert.equal(created.projectId, projectId);
  await dialog.getByRole('button', { name: '閉じる' }).last().click();
  await context.close();

  // Experiments page: the chosen Experiment's ID in the heading and in the examples.
  const experimentPage = await openPage('editor', (api) => `/experiments?experiment=${api.state.experiments[0].id}`);
  const experiment = experimentPage.api.state.experiments[0];
  const header = experimentPage.page.locator('header.page-header');
  await header.getByRole('heading', { name: experiment.name }).waitFor();
  await header.locator('.copyable-value', { hasText: '実験ID' }).getByRole('button').click();
  assert.equal(await clipboard(experimentPage.page), experiment.id);
  const toggle = header.getByRole('button', { name: 'SDKで記録' });
  assert.equal(await toggle.getAttribute('aria-expanded'), 'false');
  await toggle.click();
  assert.equal(await toggle.getAttribute('aria-expanded'), 'true');
  const experimentGuide = await guideOf(experimentPage.page);
  assert.equal(await copyValueOf(experimentPage.page, experimentGuide, '実験ID'), experiment.id);
  const experimentEnvironment = await copySnippet(experimentPage.page, experimentGuide, '環境変数');
  assert.match(experimentEnvironment, new RegExp(`export MMT_EXPERIMENT_ID=${experiment.id}\n`));
  assert.match(
    await copySnippet(experimentPage.page, experimentGuide, 'Pythonの例'),
    /start_run\(name="first-run"\)/,
  );
  if (outputDirectory)
    await experimentPage.page.screenshot({ path: `${outputDirectory}/03-experiment-guide.png` });
  await experimentGuide.getByRole('tab', { name: 'MLflow 3' }).click();
  assert.match(
    await copySnippet(experimentPage.page, experimentGuide, 'Pythonの例'),
    new RegExp(`set_experiment\\("${experiment.name}"\\)`),
  );
  await toggle.click();
  assert.equal(await experimentPage.page.locator('section.recording-connection').count(), 0);
  await experimentPage.context.close();

  // A viewer reads the guide but cannot hold the write scopes, so gets no token button.
  const viewer = await openPage('viewer', () => '/settings');
  const viewerGuide = await guideOf(viewer.page);
  assert.equal(
    await viewerGuide.getByRole('button', { name: 'このProject用のAPI tokenを発行' }).count(),
    0,
  );
  await viewer.context.close();
  console.log('recording connection guide: ok');
} finally {
  await browser.close();
}
