// 分離したAPI（ポート47480）とVite（47481）で、途中で止まったArtifactのアップロード
// （「途中のアップロード」）を続きから送れることをブラウザで確かめる。mmt_testに一時的なschemaを
// 作るので、共有の開発APIとDBには触れない。
//
//   (cd apps/web && MMT_WEB_API_PROXY_TARGET=http://127.0.0.1:47480 npx vite --port 47481 --strictPort --host 127.0.0.1) &
//   MMT_TEST_DATABASE_URL=postgresql://mmt@127.0.0.1:55490/mmt_test \
//   MMT_PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs \
//   MMT_SCREENSHOT_DIR=artifacts/verification/<日付>/<担当>/after \
//   npx tsx apps/web/tests/browser-upload-resume.mjs
//
// スクリプトがAPIをTypeScriptのソースから起動するので、tsxが要る。
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { copyFile, mkdir, mkdtemp, open, readFile, rm, utimes, writeFile } from 'node:fs/promises';
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

const API_PORT = 47480;
const WEB_URL = process.env.MMT_WEB_URL ?? 'http://127.0.0.1:47481';
const MIB = 1024 * 1024;
// 点検で挙がった例: 150 MiBのcheckpointは16 MiBずつ10個のpartになる（最後のpartは6 MiB）。
const CHECKPOINT_BYTES = 150 * MIB;
const PART_BYTES = 16 * MIB;
const PART_COUNT = Math.ceil(CHECKPOINT_BYTES / PART_BYTES);
// ページを再読み込みする前にサーバーへ届くpartの数。
const PARTS_BEFORE_INTERRUPTION = 3;
const COMPLETION_TIMEOUT_MS = 180_000;
const DESKTOP = { width: 1440, height: 900 };
const MOBILE = { width: 390, height: 844 };

const databaseUrl = process.env.MMT_TEST_DATABASE_URL;
if (!databaseUrl || !/^\/mmt_test(?:_|$)/.test(new URL(databaseUrl).pathname))
  throw new Error('MMT_TEST_DATABASE_URL must point to the dedicated mmt_test database');
const modulePath = process.env.MMT_PLAYWRIGHT_MODULE;
if (!modulePath) throw new Error('Set MMT_PLAYWRIGHT_MODULE to an installed Playwright index.mjs');
const { chromium } = await import(pathToFileURL(modulePath).href);
const screenshotDirectory = process.env.MMT_SCREENSHOT_DIR;

const schema = `mmt_upload_resume_${randomBytes(4).toString('hex')}`;
const administrator = new pg.Pool({ connectionString: databaseUrl });
await administrator.query(`CREATE SCHEMA ${schema}`);
const database = new pg.Pool({ connectionString: databaseUrl, options: `-c search_path=${schema}` });
const artifactDirectory = await mkdtemp(path.join(tmpdir(), 'mmt-upload-resume-artifacts-'));
const fileDirectory = await mkdtemp(path.join(tmpdir(), 'mmt-upload-resume-files-'));
const config = loadConfig({
  MMT_DATABASE_URL: databaseUrl,
  MMT_AUTH_MODE: 'development',
  MMT_PORT: String(API_PORT),
  MMT_WEB_ORIGIN: WEB_URL,
});
const application = createApplication({
  config,
  database,
  stores: createArtifactStoresFromEnv({ MMT_ARTIFACT_FILESYSTEM_ROOT: artifactDirectory }),
});
let server;
const browser = await chromium.launch({
  headless: true,
  ...(process.env.MMT_CHROMIUM_PATH ? { executablePath: process.env.MMT_CHROMIUM_PATH } : {}),
  args: ['--no-sandbox'],
});
const results = {};

async function writeRandomFile(filePath, size) {
  await mkdir(path.dirname(filePath), { recursive: true });
  const handle = await open(filePath, 'w');
  try {
    for (let written = 0; written < size; written += 8 * MIB)
      await handle.write(randomBytes(Math.min(8 * MIB, size - written)));
  } finally {
    await handle.close();
  }
  return filePath;
}

async function sha256OfFile(filePath) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(filePath)) hash.update(chunk);
  return hash.digest('hex');
}

/** 幅1440と390でのビューポートのスクリーンショット。先に`focus`が見えるまでスクロールする。 */
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

/** ページが各アップロードセッションへ送るpartを、送った順に記録する。 */
function watchPartRequests(page) {
  const requests = [];
  let okResponses = 0;
  page.on('request', (request) => {
    const match = request.method() === 'PUT' && new URL(request.url()).pathname.match(/\/artifact-uploads\/([^/]+)\/parts\/(\d+)$/);
    if (match) requests.push({ uploadId: match[1], partNumber: Number(match[2]) });
  });
  page.on('response', (response) => {
    if (response.request().method() === 'PUT' && /\/parts\/\d+$/.test(new URL(response.url()).pathname) && response.ok())
      okResponses += 1;
  });
  return {
    /** partsSentSinceで数え始める位置。 */
    mark: () => requests.length,
    /** `mark`のあとでそのセッションへ送ったpart番号を、重複を除いて昇順に並べたもの。 */
    partsSentSince: (uploadId, mark = 0) =>
      [...new Set(requests.slice(mark).filter((item) => item.uploadId === uploadId).map((item) => item.partNumber))].sort(
        (left, right) => left - right,
      ),
    okResponses: () => okResponses,
  };
}

/**
 * `isHolding`の間、PARTS_BEFORE_INTERRUPTIONを超える番号のpartの要求をAPIの手前で止めておく。
 * 止めるのをサーバー側にしたのは、Playwrightの要求の横取りを外したあと、ページのその後のフォントの
 * 要求が保留のまま残り、スクリーンショットがフォントを待ち続けたため。
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
  if (match && partGate.isHolding && Number(match[1]) > PARTS_BEFORE_INTERRUPTION) {
    await partGate.released;
    // 送ったページはもう再読み込みされているので、この応答を読むものはいない。
    return new Response(null, { status: 503 });
  }
  return application.app.fetch(request, ...rest);
}

/** `filePath`を`artifactPath`へアップロードし始め、最初のpartが保存されたら再読み込みする。 */
async function interruptUpload(page, parts, { openDialog, filePath, artifactPath }) {
  const okBefore = parts.okResponses();
  holdLaterParts();
  await openDialog();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('ファイルを選ぶ').setInputFiles(filePath);
  await dialog.getByLabel('保存パス').fill(artifactPath);
  await dialog.getByRole('button', { name: 'アップロードを開始' }).click();
  while (parts.okResponses() < okBefore + PARTS_BEFORE_INTERRUPTION) await new Promise((resolve) => setTimeout(resolve, 20));
  await page.reload();
  releaseLaterParts();
}

try {
  await migrate(database);
  application.artifactUploadFinalizer.start();
  const timeouts = serverTimeouts(config);
  server = serve({ fetch: fetchThroughPartGate, hostname: '127.0.0.1', port: API_PORT, serverOptions: timeouts.serverOptions });

  const checkpoint = await writeRandomFile(path.join(fileDirectory, 'run', 'model-checkpoint-step-12000.bin'), CHECKPOINT_BYTES);
  const checkpointSha256 = await sha256OfFile(checkpoint);
  // 大きさも名前の付け方も同じで、保存済みのpartが1つだけ違う: 同じモデルの次のcheckpoint。
  const nextCheckpointBytes = await readFile(checkpoint);
  nextCheckpointBytes.set(randomBytes(PART_BYTES), PART_BYTES);
  const nextCheckpoint = path.join(fileDirectory, 'run', 'model-checkpoint-step-13000.bin');
  await writeFile(nextCheckpoint, nextCheckpointBytes);
  // 同じバイト列を、名前と時刻を変えて別の場所へコピーしたもの。別のコンピュータにあるファイルにあたる。
  const copiedCheckpoint = path.join(fileDirectory, 'copy', 'step12000-copy.bin');
  await mkdir(path.dirname(copiedCheckpoint), { recursive: true });
  await copyFile(checkpoint, copiedCheckpoint);
  await utimes(copiedCheckpoint, new Date('2026-10-01T00:00:00Z'), new Date('2026-10-01T00:00:00Z'));

  const context = await browser.newContext({ locale: 'ja-JP', viewport: DESKTOP });
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
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
  // Privateにして、アップロードできるかをメンバーのroleだけで決める（publicなProjectでは全員がeditorになる）。
  const project = await api('/projects', { method: 'post', body: { name: '続きを送るの確認', visibility: 'private' } });
  const experiment = await api(`/projects/${project.id}/experiments`, { method: 'post', body: { name: 'Checkpoints' } });
  const run = await api(`/projects/${project.id}/runs`, {
    method: 'post',
    body: { experimentId: experiment.id, name: 'finetune-run', kind: 'training' },
  });
  const runUrl = `${WEB_URL}/projects/${project.id}/runs/${run.id}?tab=artifacts`;
  const openSessions = async () => (await api(`/projects/${project.id}/artifact-uploads?status=open`)).items;
  const sessionAt = async (artifactPath) => (await openSessions()).find((session) => session.path === artifactPath);
  const runArtifact = async (artifactPath) =>
    (await api(`/projects/${project.id}/runs/${run.id}/artifacts`)).items.find((artifact) => artifact.path === artifactPath);
  const dialog = page.getByRole('dialog');
  const openUploadDialog = async () => {
    await page.goto(runUrl);
    await page.getByRole('button', { name: 'Artifactをアップロード' }).click();
    await dialog.waitFor();
  };
  const resumableRow = (artifactPath) => dialog.getByTestId('upload-resumable-session').filter({ hasText: artifactPath });
  const queueRow = (artifactPath) => dialog.getByTestId('upload-queue-row').filter({ hasText: artifactPath });
  const waitCompleted = (artifactPath) =>
    queueRow(artifactPath).and(page.locator('[data-status="completed"]')).waitFor({ timeout: COMPLETION_TIMEOUT_MS });
  const allPartNumbers = Array.from({ length: PART_COUNT }, (_, index) => index + 1);
  const missingPartNumbers = allPartNumbers.slice(PARTS_BEFORE_INTERRUPTION);
  const sentBeforeInterruption = `${PARTS_BEFORE_INTERRUPTION * PART_BYTES / MIB}.0 MiB / 150.0 MiB 送信済み`;

  // 1. 点検で挙がった例: 同じファイルを選び直すと、前回の保存パスが入り、続きから送る。
  const auditPath = 'checkpoints/step-12000/model.bin';
  await interruptUpload(page, parts, { openDialog: openUploadDialog, filePath: checkpoint, artifactPath: auditPath });
  await page.getByRole('button', { name: 'Artifactをアップロード' }).click();
  await resumableRow(auditPath).waitFor();
  const auditSession = await sessionAt(auditPath);
  assert.equal(auditSession.receivedBytes, PARTS_BEFORE_INTERRUPTION * PART_BYTES);
  await resumableRow(auditPath).getByText(sentBeforeInterruption).waitFor();
  await resumableRow(auditPath).getByText('model-checkpoint-step-12000.bin').waitFor();
  assert.equal(await resumableRow(auditPath).getByLabel('続きを送る').count(), 1);
  await screenshotBoth(page, '01-resumable-row', resumableRow(auditPath));

  await dialog.getByLabel('ファイルを選ぶ').setInputFiles(checkpoint);
  await dialog.getByTestId('upload-resume-matched').waitFor();
  assert.equal(await dialog.getByLabel('保存パス').inputValue(), auditPath, 'the earlier path is filled in');
  await screenshotBoth(page, '02-same-file-path-filled', dialog.getByTestId('upload-resume-matched'));
  // 保存パスを書き換えると最初からになると伝え、保存パスは元に戻せる。
  await dialog.getByLabel('保存パス').fill('checkpoints/other.bin');
  await dialog.getByTestId('upload-resume-path-changed').waitFor();
  await screenshotBoth(page, '03-path-changed', dialog.getByTestId('upload-resume-path-changed'));
  await dialog.getByRole('button', { name: '保存パスを戻す' }).click();
  assert.equal(await dialog.getByLabel('保存パス').inputValue(), auditPath);
  const beforeAuditResume = parts.mark();
  await dialog.getByRole('button', { name: 'アップロードを開始' }).click();
  await waitCompleted(auditPath);
  assert.deepEqual(parts.partsSentSince(auditSession.id, beforeAuditResume), missingPartNumbers, 'only the missing parts');
  const auditArtifact = await runArtifact(auditPath);
  assert.equal(auditArtifact.id, auditSession.id, 'the same session became the Artifact');
  assert.equal(auditArtifact.sha256, checkpointSha256);
  assert.equal(await resumableRow(auditPath).count(), 0);
  await screenshotBoth(page, '04-resumed-completed', queueRow(auditPath));
  results.sameFileFillsPath = { path: auditPath, resumedFromBytes: auditSession.receivedBytes, sha256Matches: true };

  // 2. 大きさが同じ別のファイルは続きにしない: パスは入らず、行で断られる。
  const guardPath = 'checkpoints/step-14000/model.bin';
  await interruptUpload(page, parts, { openDialog: openUploadDialog, filePath: checkpoint, artifactPath: guardPath });
  await page.getByRole('button', { name: 'Artifactをアップロード' }).click();
  await resumableRow(guardPath).waitFor();
  const guardSession = await sessionAt(guardPath);
  await dialog.getByLabel('ファイルを選ぶ').setInputFiles(nextCheckpoint);
  await dialog.getByRole('button', { name: 'アップロードを開始' }).and(page.locator(':not([disabled])')).waitFor();
  assert.equal(await dialog.getByLabel('保存パス').inputValue(), 'model-checkpoint-step-13000.bin', 'another file keeps its own name');
  assert.equal(await dialog.getByTestId('upload-resume-matched').count(), 0);
  await dialog.getByRole('button', { name: '選び直す' }).click();
  const beforeRefusal = parts.mark();
  await resumableRow(guardPath).getByLabel('続きを送る').setInputFiles(nextCheckpoint);
  await resumableRow(guardPath).and(page.locator('[data-blocker="contentDiffers"]')).waitFor();
  await resumableRow(guardPath).getByText('送信済みの部分と中身が一致しません').waitFor();
  assert.deepEqual(parts.partsSentSince(guardSession.id, beforeRefusal), [], 'nothing of the other file was sent');
  await screenshotBoth(page, '05-other-file-refused', resumableRow(guardPath));
  await resumableRow(guardPath).getByLabel('ファイルを選び直す').setInputFiles(checkpoint);
  await waitCompleted(guardPath);
  assert.deepEqual(parts.partsSentSince(guardSession.id, beforeRefusal), missingPartNumbers);
  assert.equal((await runArtifact(guardPath)).sha256, checkpointSha256);
  results.otherFileRefused = { path: guardPath, partsSentBeforeRefusal: 3, continuedWithRightFile: true };

  // 3. 素のhttpのoriginで開いた別のブラウザ: 手元の記録もWeb Cryptoも無い。コピーしたファイル
  //    （名前も時刻も違う）は、バイト列だけで一致を判定する。
  const copyPath = 'checkpoints/step-15000/model.bin';
  await interruptUpload(page, parts, { openDialog: openUploadDialog, filePath: checkpoint, artifactPath: copyPath });
  const copySession = await sessionAt(copyPath);
  const otherContext = await browser.newContext({ locale: 'ja-JP', viewport: DESKTOP });
  await otherContext.addInitScript(() => Object.defineProperty(globalThis.crypto, 'subtle', { value: undefined }));
  const otherPage = await otherContext.newPage();
  otherPage.on('pageerror', (error) => pageErrors.push(error.message));
  const otherParts = watchPartRequests(otherPage);
  await devLogin(otherPage, 'admin@localhost', '検証管理者');
  assert.equal(await otherPage.evaluate(() => globalThis.crypto.subtle), undefined);
  await otherPage.goto(runUrl);
  await otherPage.getByRole('button', { name: 'Artifactをアップロード' }).click();
  const otherDialog = otherPage.getByRole('dialog');
  await otherDialog.getByTestId('upload-resumable-session').filter({ hasText: copyPath }).waitFor();
  await otherDialog.getByLabel('ファイルを選ぶ').setInputFiles(copiedCheckpoint);
  await otherDialog.getByTestId('upload-resume-matched').waitFor();
  assert.equal(await otherDialog.getByLabel('保存パス').inputValue(), copyPath);
  await otherDialog.getByRole('button', { name: 'アップロードを開始' }).click();
  await otherDialog.getByTestId('upload-queue-row').filter({ hasText: copyPath }).and(otherPage.locator('[data-status="completed"]')).waitFor({ timeout: COMPLETION_TIMEOUT_MS });
  assert.deepEqual(otherParts.partsSentSince(copySession.id), missingPartNumbers, 'only the missing parts');
  assert.equal((await runArtifact(copyPath)).sha256, checkpointSha256);
  await otherContext.close();
  results.copyWithoutWebCrypto = { path: copyPath, partsSent: missingPartNumbers.length };

  // 4. 期限切れ: 行にそう出て、同じパスへ最初から送り直す。
  const expiredPath = 'checkpoints/step-16000/model.bin';
  await interruptUpload(page, parts, { openDialog: openUploadDialog, filePath: checkpoint, artifactPath: expiredPath });
  const expiredSession = await sessionAt(expiredPath);
  await database.query("UPDATE artifact_uploads SET expires_at=now()-interval '1 minute' WHERE id=$1", [expiredSession.id]);
  await page.getByRole('button', { name: 'Artifactをアップロード' }).click();
  await resumableRow(expiredPath).and(page.locator('[data-blocker="expired"]')).waitFor();
  await resumableRow(expiredPath).getByText('期限（7日）が切れたため').waitFor();
  assert.equal(await resumableRow(expiredPath).getByLabel('続きを送る').count(), 0);
  await screenshotBoth(page, '06-expired', resumableRow(expiredPath));
  await resumableRow(expiredPath).getByLabel('最初から送る').setInputFiles(checkpoint);
  await waitCompleted(expiredPath);
  const restarted = await runArtifact(expiredPath);
  assert.notEqual(restarted.id, expiredSession.id, 'a new session was used');
  assert.deepEqual(parts.partsSentSince(restarted.id), allPartNumbers, 'from the first byte');
  assert.equal(restarted.sha256, checkpointSha256);
  const discarded = (await api(`/projects/${project.id}/artifact-uploads?status=aborted`)).items.find((item) => item.id === expiredSession.id);
  assert.ok(discarded, 'the expired session was discarded');
  results.expiredStartsOver = { path: expiredPath, oldSession: 'aborted' };

  // 5. ダイアログを開いている間にサーバーから消えた（別のタブで破棄した）。
  const gonePath = 'checkpoints/step-17000/model.bin';
  await interruptUpload(page, parts, { openDialog: openUploadDialog, filePath: checkpoint, artifactPath: gonePath });
  await page.getByRole('button', { name: 'Artifactをアップロード' }).click();
  await resumableRow(gonePath).waitFor();
  const goneSession = await sessionAt(gonePath);
  await api(`/projects/${project.id}/artifact-uploads/${goneSession.id}`, { method: 'delete' });
  await resumableRow(gonePath).getByLabel('続きを送る').setInputFiles(checkpoint);
  await resumableRow(gonePath).and(page.locator('[data-blocker="gone"]')).waitFor();
  await resumableRow(gonePath).getByText('サーバーに残っていません').waitFor();
  await screenshotBoth(page, '07-gone', resumableRow(gonePath));
  await resumableRow(gonePath).getByRole('button', { name: '最初から送る' }).click();
  await waitCompleted(gonePath);
  assert.equal((await runArtifact(gonePath)).sha256, checkpointSha256);
  results.goneStartsOver = { path: gonePath };

  // 6. ダイアログを開いている間に、editorのroleがviewerへ下がる。
  const editorContext = await browser.newContext({ locale: 'ja-JP', viewport: DESKTOP });
  const editorPage = await editorContext.newPage();
  editorPage.on('pageerror', (error) => pageErrors.push(error.message));
  editorPage.on('dialog', (dialog) => void dialog.accept());
  const editorParts = watchPartRequests(editorPage);
  const editor = await devLogin(editorPage, 'researcher@example.test', '研究者');
  await api(`/projects/${project.id}/members/${editor.id}`, { method: 'put', body: { role: 'editor' } });
  const editorDialog = editorPage.getByRole('dialog');
  const permissionPath = 'checkpoints/step-18000/model.bin';
  await interruptUpload(editorPage, editorParts, {
    openDialog: async () => {
      await editorPage.goto(runUrl);
      await editorPage.getByRole('button', { name: 'Artifactをアップロード' }).click();
      await editorDialog.waitFor();
    },
    filePath: checkpoint,
    artifactPath: permissionPath,
  });
  await editorPage.getByRole('button', { name: 'Artifactをアップロード' }).click();
  const editorRow = editorDialog.getByTestId('upload-resumable-session').filter({ hasText: permissionPath });
  await editorRow.waitFor();
  await api(`/projects/${project.id}/members/${editor.id}`, { method: 'put', body: { role: 'viewer' } });
  await editorRow.getByLabel('続きを送る').setInputFiles(checkpoint);
  await editorRow.and(editorPage.locator('[data-blocker="permissionLost"]')).waitFor();
  await editorRow.getByText('Artifactを追加する権限がなくなりました').waitFor();
  assert.equal(await editorRow.getByLabel('続きを送る').count(), 0, 'no button that would fail again');
  await screenshotBoth(editorPage, '08-permission-lost', editorRow);
  await editorPage.reload();
  await editorPage.getByText('Artifacts').first().waitFor();
  assert.equal(await editorPage.getByRole('button', { name: 'Artifactをアップロード' }).count(), 0, 'a viewer has no upload button');
  await editorContext.close();
  results.permissionLost = { path: permissionPath, viewerHasNoUploadButton: true };

  assert.deepEqual(pageErrors, []);
  console.log(JSON.stringify(results, null, 2));
  if (screenshotDirectory) await writeFile(path.join(screenshotDirectory, 'browser-upload-resume.json'), `${JSON.stringify(results, null, 2)}\n`);
} finally {
  await browser.close();
  await application.artifactUploadFinalizer.stop();
  await application.outbox.stop();
  await new Promise((resolve) => (server ? server.close(() => resolve()) : resolve()));
  await database.end();
  await administrator.query(`DROP SCHEMA ${schema} CASCADE`);
  await administrator.end();
  await rm(artifactDirectory, { recursive: true, force: true });
  await rm(fileDirectory, { recursive: true, force: true });
}
