// Browser check that data screens lead somewhere: the Artifact catalog names what each file belongs
// to and keeps files that something uses from a delete that would fail, a dataset shows its
// description and can be archived, a version lists the Runs that used it and opens Lineage around
// it, the upload dialog starts in the open folder and warns about a path already used, a discarded
// folder upload says which files it kept and why, archiving the dataset open by default keeps it
// open, and the catalog's next page asks only about its own files. It runs against an isolated
// API (port 48480) and Vite (48481) on a temporary schema in mmt_test.
//
//   (cd apps/web && MMT_WEB_API_PROXY_TARGET=http://127.0.0.1:48480 npx vite --port 48481 --strictPort --host 127.0.0.1) &
//   MMT_TEST_DATABASE_URL=postgresql://mmt@127.0.0.1:55490/mmt_test \
//   MMT_PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs \
//   MMT_SCREENSHOT_DIR=artifacts/verification/<日付>/<担当>/after \
//   npx tsx apps/web/tests/browser-data-links.mjs
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
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
const DESKTOP = { width: 1440, height: 900 };
const MOBILE = { width: 390, height: 844 };

const databaseUrl = process.env.MMT_TEST_DATABASE_URL;
if (!databaseUrl || !/^\/mmt_test(?:_|$)/.test(new URL(databaseUrl).pathname))
  throw new Error('MMT_TEST_DATABASE_URL must point to the dedicated mmt_test database');
const modulePath = process.env.MMT_PLAYWRIGHT_MODULE;
if (!modulePath) throw new Error('Set MMT_PLAYWRIGHT_MODULE to an installed Playwright index.mjs');
const { chromium } = await import(pathToFileURL(modulePath).href);
const screenshotDirectory = process.env.MMT_SCREENSHOT_DIR;

const schema = `mmt_data_links_${randomBytes(4).toString('hex')}`;
const administrator = new pg.Pool({ connectionString: databaseUrl });
await administrator.query(`CREATE SCHEMA ${schema}`);
const database = new pg.Pool({ connectionString: databaseUrl, options: `-c search_path=${schema}` });
const artifactDirectory = await mkdtemp(path.join(tmpdir(), 'mmt-data-links-artifacts-'));
const fileDirectory = await mkdtemp(path.join(tmpdir(), 'mmt-data-links-files-'));
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

try {
  await migrate(database);
  server = serve({
    fetch: application.app.fetch,
    hostname: '127.0.0.1',
    port: API_PORT,
    serverOptions: serverTimeouts(config).serverOptions,
  });
  const context = await browser.newContext({ locale: 'ja-JP', viewport: DESKTOP });
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.goto(WEB_URL);
  await page.getByLabel('メールアドレス').fill('admin@localhost');
  await page.getByLabel('表示名').fill('検証管理者');
  await Promise.all([
    page.waitForResponse((item) => item.url().endsWith('/api/auth/dev-login')),
    page.getByRole('button', { name: '開発モードでログイン', exact: true }).click(),
  ]);
  const api = async (endpoint, { method = 'get', body, binary, contentType } = {}) => {
    const response = await page.request[method](`${WEB_URL}/api${endpoint}`, {
      ...(body ? { data: body } : {}),
      ...(binary ? { data: binary } : {}),
      headers: { Origin: WEB_URL, ...(contentType ? { 'Content-Type': contentType } : {}) },
    });
    assert.ok(response.ok(), `${method} ${endpoint}: ${response.status()} ${await response.text()}`);
    return response.json();
  };
  const store = (artifactPath, contents, runId) =>
    api(`/projects/${project.id}${runId ? `/runs/${runId}` : ''}/artifacts?path=${encodeURIComponent(artifactPath)}`, {
      method: 'put',
      binary: Buffer.from(contents),
      contentType: artifactPath.endsWith('.wav') ? 'audio/wav' : 'text/plain',
    });
  const project = await api('/projects', { method: 'post', body: { name: 'データのつながりの確認', visibility: 'private' } });
  const experiment = await api(`/projects/${project.id}/experiments`, { method: 'post', body: { name: '学習' } });
  const dataset = await api(`/projects/${project.id}/datasets`, {
    method: 'post',
    body: { name: '合成母音コーパス', namespace: 'audio', description: '母音 a・i・u の合成音声。話者10人ぶん。' },
  });
  const clip = await store(`datasets/${dataset.id}/2026-10-11T05-52-01-123Z/vowel-a.wav`, 'RIFF-vowel-a');
  const version = await api(`/projects/${project.id}/datasets/${dataset.id}/versions`, {
    method: 'post',
    body: { content: { kind: 'artifacts', files: [{ path: 'vowel-a.wav', artifactId: clip.id }] } },
  });
  const run = await api(`/projects/${project.id}/runs`, {
    method: 'post',
    body: { experimentId: experiment.id, name: '母音で学習', kind: 'training', inputDatasetVersionIds: [version.id] },
  });
  const notes = await store('samples/2026-10-11/notes.txt', '評価のメモ', run.id);
  // A stopped folder upload's file: no version lists it yet.
  await store(`datasets/${dataset.id}/2026-10-11T06-10-44-001Z/vowel-i.wav`, 'RIFF-vowel-i');

  console.log('1. Artifacts一覧: Runなしのファイルにも所属が出て、種類は言葉で出る');
  await page.goto(`${WEB_URL}/projects/${project.id}/artifacts`);
  const listedClip = page.getByRole('row').filter({ hasText: 'vowel-a.wav' });
  await listedClip.getByRole('link', { name: 'データセット 合成母音コーパス / 1' }).waitFor();
  await listedClip.getByText('音声 · wav').waitFor();
  const stoppedFile = page.getByRole('row').filter({ hasText: 'vowel-i.wav' });
  await stoppedFile.getByText('途中のアップロード').waitFor();
  await screenshotBoth(page, '10-catalog-owners', listedClip);

  console.log('2. 使われているファイルは削除メニューで押せず、理由と使われている場所が出る');
  await listedClip.getByRole('button', { name: /vowel-a\.wav/ }).click();
  const details = page.getByTestId('artifact-details');
  await details.getByTestId('artifact-reference-links').getByRole('link', { name: '合成母音コーパス / 1' }).waitFor();
  await details.getByRole('link', { name: /ダウンロード/ }).waitFor();
  await details.getByRole('button', { name: 'ファイルの操作' }).click();
  const deleteItem = details.getByRole('menuitem', { name: '削除' });
  assert.equal(await deleteItem.isDisabled(), true);
  await details.getByText('使われているため削除できません').waitFor();
  await screenshotBoth(page, '11-catalog-referenced-delete', details);

  console.log('3. 使われていないファイルを消すと、知らせが出てプレビューは空に戻る');
  await page.goto(`${WEB_URL}/projects/${project.id}/runs/${run.id}?tab=artifacts&artifactPrefix=samples/2026-10-11/`);
  await page.getByRole('button', { name: 'samples/2026-10-11/notes.txt' }).click();
  await page.getByTestId('artifact-details').getByRole('button', { name: 'ファイルの操作' }).click();
  await page.getByRole('menuitem', { name: '削除' }).click();
  await page.getByRole('dialog', { name: 'Artifactを削除' }).getByRole('button', { name: '削除' }).click();
  await page.getByTestId('artifact-deleted-notice').getByText('「samples/2026-10-11/notes.txt」を削除しました。').waitFor();
  assert.equal(await page.getByTestId('artifact-details').count(), 0, 'the preview does not jump to another file');
  await screenshotBoth(page, '12-run-artifact-deleted', page.getByTestId('artifact-deleted-notice'));
  const deletedResponse = await page.request.get(`${WEB_URL}/api/projects/${project.id}/artifacts/${notes.id}`);
  assert.equal(deletedResponse.status(), 404);

  console.log('4. アップロードは開いているフォルダから始まり、同じパスがあれば知らせる');
  await store('samples/2026-10-11/table.csv', 'a,b\n1,2\n', run.id);
  await page.goto(`${WEB_URL}/projects/${project.id}/runs/${run.id}?tab=artifacts&artifactPrefix=samples/2026-10-11/`);
  await page.getByRole('button', { name: 'Artifactをアップロード' }).click();
  const uploadDialog = page.getByRole('dialog');
  const tablePath = path.join(fileDirectory, 'table.csv');
  await writeFile(tablePath, 'a,b\n1,2\n');
  await uploadDialog.getByLabel('ファイルを選ぶ').setInputFiles(tablePath);
  assert.equal(await uploadDialog.getByLabel('保存パス').inputValue(), 'samples/2026-10-11/table.csv');
  await uploadDialog.getByTestId('upload-path-exists').getByText('中身も同じなので、送らなくても構いません。').waitFor();
  await screenshotBoth(page, '13-upload-default-folder-existing', uploadDialog.getByTestId('upload-path-exists'));
  await uploadDialog.getByRole('button', { name: '閉じる' }).first().click();

  console.log('5. データセット: 説明が出て、⋯から説明の変更とアーカイブができる');
  await page.goto(`${WEB_URL}/projects/${project.id}/datasets?id=${dataset.id}`);
  const summary = page.getByTestId('dataset-summary');
  await summary.getByText('母音 a・i・u の合成音声。話者10人ぶん。').waitFor();
  await page.getByRole('button', { name: 'データセットの操作' }).click();
  await page.getByRole('menuitem', { name: '説明を変更' }).click();
  const descriptionDialog = page.getByRole('dialog', { name: '説明を変更' });
  await descriptionDialog.getByLabel('説明').fill('母音 a・i・u・e・o の合成音声。');
  await descriptionDialog.getByRole('button', { name: '保存' }).click();
  await summary.getByText('母音 a・i・u・e・o の合成音声。').waitFor();

  console.log('6. バージョンから、入力にしたRunとLineageへ進める');
  const usage = page.getByTestId('dataset-version-usage');
  await usage.getByRole('link', { name: '母音で学習' }).waitFor();
  await screenshotBoth(page, '14-dataset-summary-usage', usage);
  await usage.getByRole('link', { name: 'Lineageで見る' }).click();
  await page.getByTestId('lineage-focus').getByText('「合成母音コーパス 1」の前後2段だけを表示しています。').waitFor();
  await screenshotBoth(page, '15-lineage-focus', page.getByTestId('lineage-focus'));
  await page.getByRole('button', { name: '全体を表示' }).first().click();
  await page.getByTestId('lineage-focus').waitFor({ state: 'detached' });

  console.log('6b. 途中のフォルダのアップロードを破棄すると、使われているファイルは残り、理由と見る先が出る');
  const stoppedFolder = `datasets/${dataset.id}/2026-10-11T06-10-44-001Z/`;
  const weights = await store(`${stoppedFolder}weights.bin`, 'weights');
  const model = await api(`/projects/${project.id}/models`, { method: 'post', body: { name: '母音モデル', family: 'qwen2' } });
  await api(`/projects/${project.id}/models/${model.id}/versions`, { method: 'post', body: { artifactId: weights.id } });
  await page.goto(`${WEB_URL}/projects/${project.id}/datasets?id=${dataset.id}`);
  await page.getByRole('button', { name: 'フォルダから作る' }).click();
  const folderDialog = page.getByRole('dialog', { name: /フォルダから作る/ });
  await folderDialog.getByTestId('unfinished-folder-upload').getByRole('button', { name: '破棄' }).click();
  const discardConfirm = page.getByRole('dialog', { name: '途中のフォルダのアップロードを破棄' });
  await discardConfirm.getByRole('button', { name: '破棄' }).click();
  await discardConfirm.waitFor({ state: 'detached' });
  const keptFiles = folderDialog.getByTestId('folder-upload-kept-files');
  await keptFiles.getByText('1件のファイルは、モデルバージョン・コードバージョン・checkpointが使っているため削除していません').waitFor();
  await folderDialog.getByTestId('unfinished-folder-upload').getByText('保存済み 1件').waitFor();
  await screenshotBoth(page, '17-folder-discard-kept-files', keptFiles);
  await keptFiles.getByRole('link', { name: '残したファイルをArtifactsで見る' }).click();
  await page.getByRole('row').filter({ hasText: 'weights.bin' }).getByRole('link', { name: '母音モデル / 1' }).waitFor();
  assert.equal(await page.getByRole('row').filter({ hasText: 'vowel-i.wav' }).count(), 0, 'the unused file was deleted');

  console.log('7. 既定で開いているデータセットをアーカイブしても開いたままで、知らせが出る');
  // The newest dataset opens by default; archiving moves it to the end of the list.
  const newest = await api(`/projects/${project.id}/datasets`, { method: 'post', body: { name: '話者別コーパス' } });
  await page.goto(`${WEB_URL}/projects/${project.id}/datasets`);
  await page.getByRole('heading', { name: '話者別コーパス' }).waitFor();
  await page.getByRole('button', { name: 'データセットの操作' }).click();
  await page.getByRole('menuitem', { name: 'アーカイブ' }).click();
  await page.getByRole('dialog', { name: 'アーカイブ' }).getByRole('button', { name: 'アーカイブ' }).click();
  const archiveChange = page.getByTestId('dataset-archive-change');
  await archiveChange.getByText('「話者別コーパス」をアーカイブしました。').waitFor();
  await page.getByTestId('dataset-summary').getByText('アーカイブ済みです。').waitFor();
  await page.getByRole('heading', { name: '話者別コーパス' }).waitFor();
  assert.equal(new URL(page.url()).searchParams.get('id'), newest.id, 'the archived dataset stays open');
  await screenshotBoth(page, '18-dataset-archived-default', archiveChange);

  console.log('7b. アーカイブすると印が付き、一覧からは既定で隠れる');
  await page.goto(`${WEB_URL}/projects/${project.id}/datasets?id=${dataset.id}`);
  await page.getByRole('button', { name: 'データセットの操作' }).click();
  await page.getByRole('menuitem', { name: 'アーカイブ' }).click();
  await page.getByRole('dialog', { name: 'アーカイブ' }).getByRole('button', { name: 'アーカイブ' }).click();
  await page.getByTestId('dataset-summary').getByText('アーカイブ済みです。').waitFor();
  const archived = await api(`/projects/${project.id}/datasets/${dataset.id}`);
  assert.ok(archived.archivedAt);
  await screenshotBoth(page, '16-dataset-archived', page.getByTestId('dataset-summary'));
  await api(`/projects/${project.id}/datasets`, { method: 'post', body: { name: '評価用コーパス' } });
  await page.goto(`${WEB_URL}/projects/${project.id}/datasets`);
  await page.getByText('アーカイブ済みも表示').waitFor();
  await page.getByRole('heading', { name: '評価用コーパス' }).waitFor();
  assert.equal(await page.getByRole('button', { name: '合成母音コーパス', exact: true }).count(), 0);
  await page.getByText('アーカイブ済みも表示').click();
  await page.getByRole('button', { name: '合成母音コーパス', exact: true }).waitFor();

  console.log('8. ［続きを読み込む］は増えた行の使われている場所だけを取りに行き、表示済みの行はそのまま');
  // A full first page (100 files) of files without a Run, newer than the files above.
  for (let index = 0; index < 100; index += 1)
    await store(`exports/batch/${String(index).padStart(3, '0')}.txt`, `filler ${index}`);
  const referenceRequests = [];
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.pathname.endsWith('/artifact-references'))
      referenceRequests.push(url.searchParams.get('artifactIds').split(','));
  });
  await page.goto(`${WEB_URL}/projects/${project.id}/artifacts`);
  const fillerRow = page.getByRole('row').filter({ hasText: 'exports/batch/099.txt' });
  await fillerRow.getByText('Runなし').waitFor();
  const firstPageIds = new Set(referenceRequests.flat());
  referenceRequests.length = 0;
  await page.getByRole('button', { name: '続きを読み込む' }).click();
  await page.getByRole('row').filter({ hasText: 'weights.bin' }).getByRole('link', { name: '母音モデル / 1' }).waitFor();
  assert.ok(referenceRequests.length > 0, 'the new page is asked about');
  assert.deepEqual(
    referenceRequests.flat().filter((artifactId) => firstPageIds.has(artifactId)),
    [],
    'the rows already shown are not asked about again',
  );
  await fillerRow.getByText('Runなし').waitFor();
  await screenshotBoth(page, '19-catalog-load-more', page.getByRole('row').filter({ hasText: 'weights.bin' }));

  assert.deepEqual(pageErrors, []);
  console.log('data links: passed');
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
