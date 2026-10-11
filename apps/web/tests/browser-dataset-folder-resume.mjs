// Browser check of continuing and discarding a folder upload ("フォルダから作る") that stopped before
// its version, and of the retry state of a dropped connection, against an isolated API (port
// 48480) and Vite (48481). It creates a temporary schema in mmt_test, so the shared development
// API and DB are untouched.
//
//   (cd apps/web && MMT_WEB_API_PROXY_TARGET=http://127.0.0.1:48480 npx vite --port 48481 --strictPort --host 127.0.0.1) &
//   MMT_TEST_DATABASE_URL=postgresql://mmt@127.0.0.1:55490/mmt_test \
//   MMT_PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs \
//   MMT_SCREENSHOT_DIR=artifacts/verification/<日付>/<担当>/after \
//   npx tsx apps/web/tests/browser-dataset-folder-resume.mjs
//
// tsx is needed because the script starts the API from its TypeScript sources.
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { mkdir, mkdtemp, open, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import pg from 'pg';
import { serve } from '@hono/node-server';
import { createArtifactStoresFromEnv } from '@mmt/platform';
import { createApplication } from '../../api/src/app.ts';
import { loadConfig } from '../../api/src/config.ts';
import { migrate } from '../../api/src/db/migrate.ts';
import { serverTimeouts } from '../../api/src/http/serverTimeouts.ts';

const API_PORT = 48480;
const WEB_URL = process.env.MMT_WEB_URL ?? 'http://127.0.0.1:48481';
const MIB = 1024 * 1024;
// Above the 8 MiB single-PUT limit: two 16 MiB parts, so one can be stored and one held back.
const LARGE_FILE_BYTES = 24 * MIB;
const SMALL_FILE_COUNT = 5;
const FOLDER_FILE_COUNT = SMALL_FILE_COUNT + 2;
const VERSION_TIMEOUT_MS = 120_000;
// Five attempts with backoff of at most 1 + 2 + 4 + 8 seconds before the file stops as failed.
const RETRY_GIVE_UP_TIMEOUT_MS = 60_000;
const DESKTOP = { width: 1440, height: 900 };
const MOBILE = { width: 390, height: 844 };

const databaseUrl = process.env.MMT_TEST_DATABASE_URL;
if (!databaseUrl || !/^\/mmt_test(?:_|$)/.test(new URL(databaseUrl).pathname))
  throw new Error('MMT_TEST_DATABASE_URL must point to the dedicated mmt_test database');
const modulePath = process.env.MMT_PLAYWRIGHT_MODULE;
if (!modulePath) throw new Error('Set MMT_PLAYWRIGHT_MODULE to an installed Playwright index.mjs');
const { chromium } = await import(pathToFileURL(modulePath).href);
const screenshotDirectory = process.env.MMT_SCREENSHOT_DIR;

const schema = `mmt_folder_resume_${randomBytes(4).toString('hex')}`;
const administrator = new pg.Pool({ connectionString: databaseUrl });
await administrator.query(`CREATE SCHEMA ${schema}`);
const database = new pg.Pool({ connectionString: databaseUrl, options: `-c search_path=${schema}` });
const artifactDirectory = await mkdtemp(path.join(tmpdir(), 'mmt-folder-resume-artifacts-'));
const fileDirectory = await mkdtemp(path.join(tmpdir(), 'mmt-folder-resume-files-'));
const config = loadConfig({
  MMT_DATABASE_URL: databaseUrl,
  AUTH_MODE: 'development',
  PORT: String(API_PORT),
  MMT_WEB_ORIGIN: WEB_URL,
});
const application = createApplication({
  config,
  database,
  stores: createArtifactStoresFromEnv({ ARTIFACT_FILESYSTEM_ROOT: artifactDirectory }),
});
let server;
const browser = await chromium.launch({
  headless: true,
  ...(process.env.MMT_CHROMIUM_PATH ? { executablePath: process.env.MMT_CHROMIUM_PATH } : {}),
  args: ['--no-sandbox'],
});
const results = {};

/**
 * Holds every part after the first in front of the API while `isHolding`, so a large file stops
 * with one part stored. The hold is on the server side, as in browser-upload-resume.mjs.
 */
const partGate = { isHolding: false, release: () => undefined, released: Promise.resolve() };
function holdLaterParts() {
  partGate.isHolding = true;
  partGate.released = new Promise((resolve) => (partGate.release = resolve));
}
function releaseLaterParts() {
  partGate.isHolding = false;
  partGate.release();
}
async function fetchThroughPartGate(request, ...rest) {
  const match = request.method === 'PUT' && new URL(request.url).pathname.match(/\/artifact-uploads\/[^/]+\/parts\/(\d+)$/);
  if (match && partGate.isHolding && Number(match[1]) > 1) {
    await partGate.released;
    return new Response(null, { status: 503 });
  }
  return application.app.fetch(request, ...rest);
}

async function writeRandomFile(filePath, size) {
  await mkdir(path.dirname(filePath), { recursive: true });
  const handle = await open(filePath, 'w');
  try {
    for (let written = 0; written < size; written += 8 * MIB)
      await handle.write(randomBytes(Math.min(8 * MIB, size - written)));
  } finally {
    await handle.close();
  }
}

/** A speech corpus: small clips sent with one request each, and one large file sent in parts. */
async function writeCorpus(folder) {
  await mkdir(path.join(folder, 'train'), { recursive: true });
  for (let index = 1; index <= SMALL_FILE_COUNT; index += 1)
    await writeFile(path.join(folder, 'train', `clip-${index}.wav`), randomBytes(4096 + index));
  await writeFile(path.join(folder, 'manifest.jsonl'), '{"audio":"train/clip-1.wav","text":"テスト"}\n');
  await writeRandomFile(path.join(folder, 'weights', 'model.bin'), LARGE_FILE_BYTES);
}

async function screenshotBoth(page, name, focus) {
  if (!screenshotDirectory) return;
  await mkdir(screenshotDirectory, { recursive: true });
  for (const [label, viewport] of [['desktop', DESKTOP], ['mobile', MOBILE]]) {
    await page.setViewportSize(viewport);
    if (focus) await focus.scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(screenshotDirectory, `${name}-${label}.png`) });
  }
  await page.setViewportSize(DESKTOP);
}

async function devLogin(page, email, name) {
  await page.goto(WEB_URL);
  await page.getByLabel('メールアドレス').fill(email);
  await page.getByLabel('表示名').fill(name);
  const [response] = await Promise.all([
    page.waitForResponse((item) => item.url().endsWith('/api/auth/dev-login')),
    page.getByRole('button', { name: '開発モードでログイン', exact: true }).click(),
  ]);
  return (await response.json()).user;
}

function watchPartRequests(page) {
  const requests = [];
  page.on('request', (request) => {
    const match = request.method() === 'PUT' && new URL(request.url()).pathname.match(/\/artifact-uploads\/([^/]+)\/parts\/(\d+)$/);
    if (match) requests.push({ uploadId: match[1], partNumber: Number(match[2]) });
  });
  return {
    mark: () => requests.length,
    partsSentSince: (mark) => [...new Set(requests.slice(mark).map((item) => item.partNumber))].sort((left, right) => left - right),
  };
}

async function until(condition, { timeoutMs = 30_000, message }) {
  const deadline = Date.now() + timeoutMs;
  while (!(await condition())) {
    if (Date.now() > deadline) throw new Error(`Timed out: ${message}`);
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

try {
  await migrate(database);
  application.artifactUploadFinalizer.start();
  server = serve({
    fetch: fetchThroughPartGate,
    hostname: '127.0.0.1',
    port: API_PORT,
    serverOptions: serverTimeouts(config).serverOptions,
  });
  const corpus = path.join(fileDirectory, 'speech-corpus');
  await writeCorpus(corpus);

  const context = await browser.newContext({ locale: 'ja-JP', viewport: DESKTOP });
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  // Reloading during an upload asks first (beforeunload); the check means to leave.
  page.on('dialog', (dialog) => void dialog.accept());
  const parts = watchPartRequests(page);
  await devLogin(page, 'admin@localhost', '検証管理者');
  const api = async (endpoint, { method = 'get', body } = {}) => {
    const response = await page.request[method](`${WEB_URL}/api${endpoint}`, {
      ...(body ? { data: body } : {}),
      headers: { Origin: WEB_URL },
    });
    assert.ok(response.ok(), `${method} ${endpoint}: ${response.status()} ${await response.text()}`);
    return response.json();
  };
  const project = await api('/projects', { method: 'post', body: { name: 'フォルダの続きの確認', visibility: 'private' } });
  const dataset = await api(`/projects/${project.id}/datasets`, {
    method: 'post',
    body: { name: 'speech', namespace: 'audio', description: '母音の合成音声。話者10人ぶん。' },
  });
  const firstVersion = await api(`/projects/${project.id}/datasets/${dataset.id}/versions`, {
    method: 'post',
    body: {
      version: 'v0',
      uri: 's3://corpus/speech/v0/',
      digest: `sha256:${createHash('sha256').update('speech-v0').digest('hex')}`,
    },
  });
  const datasetsUrl = `${WEB_URL}/projects/${project.id}/datasets?id=${dataset.id}`;
  const folderUploads = async () => (await api(`/projects/${project.id}/datasets/${dataset.id}/folder-uploads`)).items;
  const openSessions = async () => (await api(`/projects/${project.id}/artifact-uploads?status=open`)).items;
  const versions = async () => (await api(`/projects/${project.id}/datasets/${dataset.id}/versions`)).items;
  const dialog = page.getByRole('dialog');
  const openFolderDialog = async () => {
    await page.goto(datasetsUrl);
    await page.getByRole('button', { name: 'フォルダから作る' }).click();
    await dialog.waitFor();
  };

  /** Starts the folder upload and reloads once the small files and the first large part are stored. */
  async function interruptFolderUpload() {
    holdLaterParts();
    await openFolderDialog();
    await dialog.getByLabel('フォルダを選ぶ').setInputFiles(corpus);
    await dialog.getByText(`${FOLDER_FILE_COUNT}件のファイル`).waitFor();
    await dialog.getByRole('button', { name: 'アップロードしてバージョンを作成' }).click();
    await dialog.getByText(`${FOLDER_FILE_COUNT - 1} / ${FOLDER_FILE_COUNT} 件完了`).waitFor({ timeout: VERSION_TIMEOUT_MS });
    await until(async () => (await openSessions()).some((session) => session.receivedBytes > 0), {
      message: 'the first part of the large file to be stored',
    });
    return dialog.getByTestId('folder-upload-progress');
  }

  console.log('1. 送信の途中: 全体の棒と、送信中のファイルだけの行');
  await openFolderDialog();
  const parentCheckbox = dialog.getByRole('checkbox', { name: 'v0' });
  assert.equal(await parentCheckbox.isChecked(), true, 'the latest version is the default parent');
  await dialog.getByRole('button', { name: '閉じる' }).first().click();
  const progress = await interruptFolderUpload();
  assert.equal(await progress.getByTestId('upload-queue-row').count(), 1, 'only the large file is listed');
  await progress.getByText('weights/model.bin').waitFor();
  await screenshotBoth(page, '01-folder-progress', progress);
  await page.reload();
  releaseLaterParts();

  console.log('2. 再読み込みのあと: 途中のフォルダのアップロードが残っている');
  const [stopped] = await folderUploads();
  assert.equal(stopped.fileCount, FOLDER_FILE_COUNT - 1);
  const storedBefore = (
    await api(`/projects/${project.id}/artifacts?query=${encodeURIComponent(stopped.pathPrefix)}&limit=500`)
  ).items.filter((artifact) => artifact.path.startsWith(stopped.pathPrefix));
  assert.equal(storedBefore.length, FOLDER_FILE_COUNT - 1);
  await openFolderDialog();
  const unfinishedRow = dialog.getByTestId('unfinished-folder-upload');
  await unfinishedRow.getByText(`保存済み ${FOLDER_FILE_COUNT - 1}件`).waitFor();
  await unfinishedRow.getByText('送りかけ 1件').waitFor();
  await screenshotBoth(page, '02-unfinished-folder-upload', unfinishedRow);

  console.log('3. 同じフォルダを選ぶと続きになり、保存済みは送らず、大きなファイルは残りのpartだけ送る');
  await dialog.getByLabel('フォルダを選ぶ').setInputFiles(corpus);
  const continuation = dialog.getByTestId('folder-continuation-notice');
  await continuation.getByText(`同じパス・大きさのファイルが${FOLDER_FILE_COUNT}件`).waitFor();
  await screenshotBoth(page, '03-folder-continuation', continuation);
  const mark = parts.mark();

  console.log('3a. 照合の途中で［照合をやめる］を押すと、何も送らずに始める前へ戻る');
  // Web Crypto's digest waits until released, so the comparison is caught while it runs.
  await page.evaluate(() => {
    const digest = crypto.subtle.digest.bind(crypto.subtle);
    const held = [];
    crypto.subtle.digest = (...args) =>
      new Promise((resolve, reject) => held.push(() => digest(...args).then(resolve, reject)));
    window.releaseHeldDigests = () => {
      delete crypto.subtle.digest;
      for (const release of held) release();
    };
  });
  await dialog.getByRole('button', { name: '続きを送ってバージョンを作成' }).click();
  const matching = dialog.getByTestId('folder-upload-matching');
  await matching.getByText('前回保存したファイルと中身を照合しています').waitFor();
  await screenshotBoth(page, '03a-folder-matching-stop', matching);
  await matching.getByRole('button', { name: '照合をやめる' }).click();
  await matching.waitFor({ state: 'detached' });
  await page.evaluate(() => window.releaseHeldDigests());
  const continueButton = dialog.getByRole('button', { name: '続きを送ってバージョンを作成' });
  assert.equal(await continueButton.isEnabled(), true, 'the dialog is back to before the start');
  await continuation.waitFor();
  assert.equal(await dialog.getByTestId('folder-upload-progress').count(), 0, 'nothing was queued');
  assert.deepEqual(parts.partsSentSince(mark), [], 'nothing was sent');

  await continueButton.click();
  await dialog.waitFor({ state: 'detached', timeout: VERSION_TIMEOUT_MS });
  const [created] = await versions();
  assert.equal(created.fileCount, FOLDER_FILE_COUNT);
  assert.deepEqual(created.parentDatasetVersionIds, [firstVersion.id]);
  const files = (await api(`/projects/${project.id}/datasets/${dataset.id}/versions/${created.id}/files`)).items;
  const storedIds = new Set(storedBefore.map((artifact) => artifact.id));
  const reused = files.filter((file) => storedIds.has(file.artifactId));
  assert.equal(reused.length, FOLDER_FILE_COUNT - 1, 'every stored file is listed as it was stored');
  assert.deepEqual(parts.partsSentSince(mark), [2], 'only the missing part of the large file is sent');
  assert.deepEqual(await folderUploads(), []);
  results.continued = { reusedFiles: reused.length, partsSent: parts.partsSentSince(mark) };

  console.log('4. 破棄: Project admin は保存済みのファイルごと消せる');
  await interruptFolderUpload();
  await page.reload();
  releaseLaterParts();
  const [toDiscard] = await folderUploads();
  const discardedIds = (
    await api(`/projects/${project.id}/artifacts?query=${encodeURIComponent(toDiscard.pathPrefix)}&limit=500`)
  ).items.map((artifact) => artifact.id);
  await openFolderDialog();
  await dialog.getByTestId('unfinished-folder-upload').getByRole('button', { name: '破棄' }).click();
  const confirm = page.getByRole('dialog', { name: '途中のフォルダのアップロードを破棄' });
  await confirm.getByText('どのバージョンにも使われていないファイルを削除します').waitFor();
  await screenshotBoth(page, '04-folder-discard-confirm', confirm);
  await confirm.getByRole('button', { name: '破棄' }).click();
  await confirm.waitFor({ state: 'detached' });
  await dialog.getByTestId('unfinished-folder-upload').waitFor({ state: 'detached' });
  assert.deepEqual(await folderUploads(), []);
  assert.equal((await openSessions()).length, 0, 'the half-sent file is discarded too');
  for (const artifactId of discardedIds) {
    const response = await page.request.get(`${WEB_URL}/api/projects/${project.id}/artifacts/${artifactId}`);
    assert.equal(response.status(), 404);
  }
  results.discarded = discardedIds.length;

  console.log('5. editor には保存済みファイルの破棄は出さず、理由を出す');
  await interruptFolderUpload();
  await page.reload();
  releaseLaterParts();
  const editorContext = await browser.newContext({ locale: 'ja-JP', viewport: DESKTOP });
  const editorPage = await editorContext.newPage();
  const editor = await devLogin(editorPage, 'editor@example.test', '検証editor');
  await api(`/projects/${project.id}/members/${editor.id}`, { method: 'put', body: { role: 'editor' } });
  await editorPage.goto(datasetsUrl);
  await editorPage.getByRole('button', { name: 'フォルダから作る' }).click();
  const editorRow = editorPage.getByRole('dialog').getByTestId('unfinished-folder-upload');
  await editorRow.getByText('保存済みのファイルを消せるのは Project admin です').waitFor();
  assert.equal(await editorRow.getByRole('button', { name: '破棄' }).count(), 0);
  await screenshotBoth(editorPage, '05-folder-unfinished-editor', editorRow);
  await editorContext.close();

  console.log('6. 回線が切れたら再試行中と出し、あきらめたら直し方を出す');
  const experiment = await api(`/projects/${project.id}/experiments`, { method: 'post', body: { name: '回線の確認' } });
  const run = await api(`/projects/${project.id}/runs`, {
    method: 'post',
    body: { experimentId: experiment.id, name: 'retry-run', kind: 'training' },
  });
  await page.goto(`${WEB_URL}/projects/${project.id}/runs/${run.id}?tab=artifacts`);
  await page.route('**/artifact-uploads/*/parts/*', (route) => route.abort('internetdisconnected'));
  await page.getByRole('button', { name: 'Artifactをアップロード' }).click();
  await dialog.getByLabel('ファイルを選ぶ').setInputFiles(path.join(corpus, 'weights', 'model.bin'));
  await dialog.getByRole('button', { name: 'アップロードを開始' }).click();
  const row = dialog.getByTestId('upload-queue-row');
  await row.getByTestId('upload-queue-retry').getByText('通信が切れたため再試行しています').waitFor({ timeout: 20_000 });
  assert.equal(await row.getByText('/秒').count(), 0, 'no transfer rate while waiting to retry');
  await screenshotBoth(page, '06-upload-retrying', row);
  await row.getByText('通信が切れました。回線を確かめてから［再開］を押すと、続きから送ります。').waitFor({
    timeout: RETRY_GIVE_UP_TIMEOUT_MS,
  });
  await screenshotBoth(page, '07-upload-network-lost', row);
  await page.unroute('**/artifact-uploads/*/parts/*');
  await row.getByRole('button', { name: '再開' }).click();
  await dialog.locator('[data-testid="upload-queue-row"][data-status="completed"]').waitFor({ timeout: VERSION_TIMEOUT_MS });

  assert.deepEqual(pageErrors, []);
  console.log(JSON.stringify(results, null, 2));
} finally {
  await browser.close();
  await application.outbox.stop();
  await application.artifactUploadFinalizer.stop();
  await new Promise((resolve) => (server ? server.close(() => resolve()) : resolve()));
  await database.end();
  await administrator.query(`DROP SCHEMA ${schema} CASCADE`);
  await administrator.end();
  await rm(artifactDirectory, { recursive: true, force: true });
  await rm(fileDirectory, { recursive: true, force: true });
}
