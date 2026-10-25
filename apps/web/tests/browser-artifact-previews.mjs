// 分離したAPI（port 48483）とVite（48482）を相手にした、Artifactのプレビューのブラウザでの確認。
// 大きなテキストの先頭とそのダウンロード、表として出すCSV / TSV / jsonl、referenceとpredictionが
// 数値の評価サンプル、スマートフォンでの評価サンプルのカード、画像の原寸、音声ビューアの時間の
// 目盛り。mmt_testに一時的なschemaを作るので、共有の開発APIとDBには触れない。
//
//   (cd apps/web && MMT_WEB_API_PROXY_TARGET=http://127.0.0.1:48483 npx vite --port 48482 --strictPort --host 127.0.0.1) &
//   MMT_TEST_DATABASE_URL=postgresql://mmt@127.0.0.1:55490/mmt_test \
//   MMT_PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs \
//   MMT_SCREENSHOT_DIR=artifacts/verification/<日付>/<担当>/after \
//   npx tsx apps/web/tests/browser-artifact-previews.mjs
//
// スクリプトがTypeScriptのソースからAPIを起動するので、tsxが要る。
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { crc32, deflateSync } from 'node:zlib';
import pg from 'pg';
import { serve } from '@hono/node-server';
import { createArtifactStoresFromEnv } from '@mmt/platform';
import { createApplication } from '../../api/src/app.ts';
import { loadConfig } from '../../api/src/config.ts';
import { migrate } from '../../api/src/db/migrate.ts';

const API_PORT = 48483;
const WEB_URL = process.env.MMT_WEB_URL ?? 'http://127.0.0.1:48482';
const DESKTOP = { width: 1440, height: 900 };
const MOBILE = { width: 390, height: 844 };
// 監査で使った学習ログ。2.3 MiBのテキストで、1 MiBのテキストのプレビューを超える。
const BIG_LOG_BYTES = Math.round(2.3 * 1024 * 1024);
// 表が描く1,000行を超えるので、残りの行についての注記が出る。
const CSV_ROW_COUNT = 1200;
const EVALUATION_SAMPLE_COUNT = 120;
const PANORAMA = { width: 2400, height: 300 };
const TONE_SECONDS = 20;
const SAMPLE_RATE = 16000;

const databaseUrl = process.env.MMT_TEST_DATABASE_URL;
if (!databaseUrl || !/^\/mmt_test(?:_|$)/.test(new URL(databaseUrl).pathname))
  throw new Error('MMT_TEST_DATABASE_URL must point to the dedicated mmt_test database');
const modulePath = process.env.MMT_PLAYWRIGHT_MODULE;
if (!modulePath) throw new Error('Set MMT_PLAYWRIGHT_MODULE to an installed Playwright index.mjs');
const { chromium } = await import(pathToFileURL(modulePath).href);
const screenshotDirectory = process.env.MMT_SCREENSHOT_DIR;

const schema = `mmt_artifact_previews_${randomBytes(4).toString('hex')}`;
const administrator = new pg.Pool({ connectionString: databaseUrl });
await administrator.query(`CREATE SCHEMA ${schema}`);
const database = new pg.Pool({ connectionString: databaseUrl, options: `-c search_path=${schema}` });
const artifactDirectory = await mkdtemp(path.join(tmpdir(), 'mmt-artifact-previews-'));
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

function trainingLog() {
  const lines = [];
  let size = 0;
  for (let step = 0; size < BIG_LOG_BYTES; step += 1) {
    const line = `2026-10-11 12:${String(Math.floor(step / 60) % 60).padStart(2, '0')}:${String(step % 60).padStart(2, '0')} INFO step ${String(step).padStart(6, '0')} loss=${(2 / (1 + step / 500)).toFixed(4)} lr=0.0003 ログ`;
    lines.push(line);
    size += Buffer.byteLength(line) + 1;
  }
  return Buffer.from(lines.join('\n')).subarray(0, BIG_LOG_BYTES);
}

function quoteCsv(value) {
  return /[",\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}

function resultsCsv() {
  const header = ['utterance_id', 'speaker', 'text_reference_long_column_name', 'prediction', 'cer', 'wer', 'duration_sec', 'sample_rate'];
  const rows = Array.from({ length: CSV_ROW_COUNT }, (_, index) => [
    `utt-${String(index).padStart(5, '0')}`,
    `spk${index % 4}`,
    '今日はいい天気ですね。今日はいい天気ですね、と話す',
    '今日はいい天気ですね',
    ((index * 37) % 1000 / 1000).toFixed(3),
    ((index * 53) % 1000 / 1000).toFixed(3),
    (1 + (index % 7) * 0.5).toFixed(1),
    '16000',
  ]);
  return [header, ...rows].map((row) => row.map(quoteCsv).join(',')).join('\n');
}

/** 100pxごとに目盛りのある横向きのグラデーション。原寸で表示したときの違いが目で分かる。 */
function panoramaPng({ width, height }) {
  const raw = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const row = y * (width * 3 + 1);
    for (let x = 0; x < width; x += 1) {
      const isMark = x % 100 === 0 || (x % 10 === 0 && y > height - 30);
      const offset = row + 1 + x * 3;
      raw[offset] = isMark ? 20 : Math.round((x / width) * 200) + 30;
      raw[offset + 1] = isMark ? 20 : Math.round((y / height) * 120) + 80;
      raw[offset + 2] = isMark ? 20 : 180;
    }
  }
  const chunk = (type, data) => {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const typeAndData = Buffer.concat([Buffer.from(type), data]);
    const checksum = Buffer.alloc(4);
    checksum.writeUInt32BE(crc32(typeAndData));
    return Buffer.concat([length, typeAndData, checksum]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header.writeUInt8(8, 8);
  header.writeUInt8(2, 9);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** 1秒ごとに大きくなって小さくなる440 Hzの音。波形に目に見える形ができる。 */
function toneWav(seconds) {
  const samples = seconds * SAMPLE_RATE;
  const wave = Buffer.alloc(44 + samples * 2);
  wave.write('RIFF', 0);
  wave.writeUInt32LE(36 + samples * 2, 4);
  wave.write('WAVEfmt ', 8);
  wave.writeUInt32LE(16, 16);
  wave.writeUInt16LE(1, 20);
  wave.writeUInt16LE(1, 22);
  wave.writeUInt32LE(SAMPLE_RATE, 24);
  wave.writeUInt32LE(SAMPLE_RATE * 2, 28);
  wave.writeUInt16LE(2, 32);
  wave.writeUInt16LE(16, 34);
  wave.write('data', 36);
  wave.writeUInt32LE(samples * 2, 40);
  for (let index = 0; index < samples; index += 1) {
    const envelope = Math.abs(Math.sin((Math.PI * index) / SAMPLE_RATE));
    wave.writeInt16LE(Math.round(Math.sin((2 * Math.PI * 440 * index) / SAMPLE_RATE) * 12000 * envelope), 44 + index * 2);
  }
  return wave;
}

async function devLogin(page) {
  await page.goto(WEB_URL);
  await page.getByLabel('メールアドレス').fill('admin@localhost');
  await page.getByLabel('表示名').fill('検証管理者');
  await page.getByRole('button', { name: '開発モードでログイン', exact: true }).click();
  await page.waitForURL((url) => !url.pathname.startsWith('/login'));
}

async function screenshot(page, name) {
  if (!screenshotDirectory) return;
  await mkdir(screenshotDirectory, { recursive: true });
  await page.screenshot({ path: path.join(screenshotDirectory, `${name}.png`) });
}

/** スクリーンショットの前に、`locator`を表示領域の上の方、固定された上部バーのすぐ下へスクロールする。 */
async function scrollNearTop(locator) {
  await locator.evaluate((element) => {
    element.scrollIntoView({ block: 'start' });
    window.scrollBy(0, -80);
  });
}

async function hasNoSidewaysPageScroll(page) {
  return page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
}

try {
  await migrate(database);
  server = serve({ fetch: application.app.fetch, hostname: '127.0.0.1', port: API_PORT });

  const desktopContext = await browser.newContext({ locale: 'ja-JP', viewport: DESKTOP });
  const mobileContext = await browser.newContext({ locale: 'ja-JP', viewport: MOBILE, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const desktop = await desktopContext.newPage();
  const mobile = await mobileContext.newPage();
  const pageErrors = [];
  for (const page of [desktop, mobile]) page.on('pageerror', (error) => pageErrors.push(error.message));
  await devLogin(desktop);
  await devLogin(mobile);

  const api = async (endpoint, { method = 'get', body } = {}) => {
    const response = await desktop.request[method](`${WEB_URL}/api${endpoint}`, {
      ...(body ? { data: body } : {}),
      headers: { Origin: WEB_URL },
    });
    assert.ok(response.ok(), `${method} ${endpoint}: ${response.status()} ${await response.text()}`);
    return response.json();
  };
  const project = await api('/projects', { method: 'post', body: { name: 'プレビューの確認', visibility: 'private' } });
  const experiment = await api(`/projects/${project.id}/experiments`, { method: 'post', body: { name: 'Previews' } });
  const run = await api(`/projects/${project.id}/runs`, {
    method: 'post',
    body: { experimentId: experiment.id, name: 'preview-run', kind: 'evaluation' },
  });
  const upload = async (artifactPath, mimeType, data) => {
    const response = await desktop.request.put(
      `${WEB_URL}/api/projects/${project.id}/runs/${run.id}/artifacts?path=${encodeURIComponent(artifactPath)}`,
      { data, headers: { 'Content-Type': mimeType, Origin: WEB_URL } },
    );
    assert.equal(response.status(), 201, `${artifactPath}: ${await response.text()}`);
  };

  await upload('logs/train-log-big.txt', 'text/plain; charset=utf-8', trainingLog());
  await upload('samples/table.csv', 'text/csv', Buffer.from(resultsCsv()));
  await upload('samples/metrics.tsv', 'text/tab-separated-values', Buffer.from('step\tloss\tnote\n1\t0.9\twarmup, slow\n2\t0.5\t\n3\t0.7\tok\n'));
  await upload(
    'samples/rows.jsonl',
    'application/x-ndjson',
    Buffer.from(['{"id":1,"label":"cat","ok":true}', '{"id":2,"label":"dog","extra":{"k":1}}'].join('\n')),
  );
  await upload(
    'eval/results.jsonl',
    'application/x-ndjson',
    Buffer.from(
      [
        '{"audio":"audio/a.wav","reference":0.1,"prediction":0.1,"score":0}',
        '{"audio":"audio/b.wav","reference":0.25,"prediction":0.3,"score":0.05}',
        '{"audio":"audio/c.wav","reference":true,"prediction":false,"score":1}',
      ].join('\n'),
    ),
  );
  await upload(
    'eval/partly-broken.jsonl',
    'application/x-ndjson',
    Buffer.from(['{"reference":"今日は","prediction":"今日わ","score":0.3}', '{"reference":{"text":"x"},"prediction":"y"}'].join('\n')),
  );
  await upload(
    'eval/eval-samples.jsonl',
    'application/x-ndjson',
    Buffer.from(
      Array.from({ length: EVALUATION_SAMPLE_COUNT }, (_, index) =>
        JSON.stringify({
          // 相対パスは表のフォルダからではなく、RunのArtifactのルートから始まる。
          audio: index === 0 ? 'eval/audio/tone.wav' : `eval/audio/missing-${index}.wav`,
          reference: 'あいうえおかきくけこ',
          prediction: index % 3 === 0 ? 'あいうえおかきくけこ' : 'あいうえおかきけこさ',
          score: Number(((index * 7) % 10 / 10).toFixed(1)),
        }),
      ).join('\n'),
    ),
  );
  await upload('eval/audio/tone.wav', 'audio/wav', toneWav(2));
  await upload('samples/wide-panorama.png', 'image/png', panoramaPng(PANORAMA));
  await upload('samples/tone-20s.wav', 'audio/wav', toneWav(TONE_SECONDS));

  const runUrl = (prefix) => `${WEB_URL}/projects/${project.id}/runs/${run.id}?tab=artifacts&artifactPrefix=${encodeURIComponent(prefix)}`;
  const openPreview = async (page, folder, fileName) => {
    await page.goto(runUrl(`${folder}/`));
    await page.locator('.artifact-tree-entry', { hasText: fileName }).first().click();
    const heading = page.locator('.artifact-preview h3', { hasText: `${folder}/${fileName}` });
    await heading.waitFor();
    return page.locator('.artifact-preview');
  };

  // 13: 2.3 MiBのログの先頭をRangeの要求で読み、注記の横にダウンロードを置く。
  {
    const contentStatuses = [];
    desktop.on('response', (response) => {
      if (/\/artifacts\/[^/]+\/content$/.test(new URL(response.url()).pathname))
        contentStatuses.push({ status: response.status(), range: response.request().headers().range ?? null });
    });
    const preview = await openPreview(desktop, 'logs', 'train-log-big.txt');
    const notice = preview.locator('.preview-download-notice');
    await notice.waitFor();
    const noticeText = await notice.innerText();
    assert.match(noticeText, /先頭の1\.0 MiBだけを表示しています（全体 2\.3 MiB）/);
    const download = notice.getByRole('link', { name: 'ダウンロード' });
    assert.equal(await download.getAttribute('download'), 'train-log-big.txt');
    await preview.locator('.code-view').getByText('step 000000', { exact: false }).first().waitFor();
    const headRequest = contentStatuses.find((item) => item.range);
    assert.deepEqual(headRequest, { status: 206, range: `bytes=0-${1024 * 1024 - 1}` });
    assert.equal(await preview.getByText('この形式はダウンロードして確認してください。').count(), 0);
    await screenshot(desktop, 'preview-13-text-head-desktop');
    const mobilePreview = await openPreview(mobile, 'logs', 'train-log-big.txt');
    await mobilePreview.locator('.preview-download-notice').waitFor();
    assert.ok(await hasNoSidewaysPageScroll(mobile));
    await scrollNearTop(mobilePreview.locator('.preview-download-notice'));
    await screenshot(mobile, 'preview-13-text-head-mobile');
    results.textHead = { notice: noticeText.trim(), request: headRequest };
  }

  // 14: 一般のCSVを、見出しを固定した並べ替えのできる表で出し、1,000行で切る。TSVとjsonlも同じ。
  {
    const preview = await openPreview(desktop, 'samples', 'table.csv');
    const table = preview.locator('.tabular-table');
    await table.waitFor();
    assert.match(await preview.locator('.tabular-preview-toolbar').innerText(), /1,200行 · 8列/);
    assert.match(await preview.locator('.tabular-preview-note').innerText(), /全1,200行のうち、先頭の1,000行/);
    assert.equal(await table.locator('tbody tr').count(), 1000);
    const formatSelect = preview.getByLabel('表示形式');
    assert.equal(await formatSelect.inputValue(), 'table');
    const cerHeader = table.locator('th', { hasText: /^cer$/ });
    await cerHeader.getByRole('button').click();
    assert.equal(await cerHeader.getAttribute('aria-sort'), 'ascending');
    const firstCer = () => table.locator('tbody tr').first().locator('td').nth(5).innerText();
    assert.equal(await firstCer(), '0.000');
    await cerHeader.getByRole('button').click();
    assert.equal(await cerHeader.getAttribute('aria-sort'), 'descending');
    assert.equal(await firstCer(), '0.999');
    // 行をスクロールしても、見出しの行は枠の上端に残る。
    const frame = preview.locator('.tabular-table-scroll');
    await frame.evaluate((element) => element.scrollTo(400, 2000));
    const [frameTop, headerTop] = await Promise.all([
      frame.evaluate((element) => element.getBoundingClientRect().top),
      cerHeader.evaluate((element) => element.getBoundingClientRect().top),
    ]);
    assert.ok(Math.abs(frameTop + 1 - headerTop) <= 1, `header ${headerTop} frame ${frameTop}`);
    await frame.evaluate((element) => element.scrollTo(0, 0));
    assert.ok(await hasNoSidewaysPageScroll(desktop));
    // 並べ替えた列を矢印つきで見せる。
    await frame.evaluate((element) => element.scrollTo(element.scrollWidth, 0));
    await screenshot(desktop, 'preview-14-csv-table-desktop');
    await frame.evaluate((element) => element.scrollTo(0, 0));
    await formatSelect.selectOption('auto');
    await preview.locator('.code-view').waitFor();
    assert.equal(await preview.getByLabel('表示形式').inputValue(), 'auto');
    await preview.getByLabel('表示形式').selectOption('table');
    await table.waitFor();

    const mobilePreview = await openPreview(mobile, 'samples', 'table.csv');
    await mobilePreview.locator('.tabular-table').waitFor();
    assert.ok(await hasNoSidewaysPageScroll(mobile));
    await scrollNearTop(mobilePreview.locator('.tabular-preview'));
    await screenshot(mobile, 'preview-14-csv-table-mobile');

    const tsv = await openPreview(desktop, 'samples', 'metrics.tsv');
    await tsv.locator('.tabular-table').waitFor();
    assert.equal(await tsv.locator('.tabular-table tbody tr').nth(0).locator('td').nth(3).innerText(), 'warmup, slow');
    const jsonl = await openPreview(desktop, 'samples', 'rows.jsonl');
    await jsonl.locator('.tabular-table').waitFor();
    assert.deepEqual(await jsonl.locator('.tabular-table thead th').allInnerTexts(), ['行', 'id', 'label', 'ok', 'extra']);
    assert.equal(await jsonl.locator('.tabular-table tbody tr').nth(1).locator('td').nth(4).innerText(), '{"k":1}');
    results.csvTable = { rows: 1000, sortedBy: 'cer', tsv: true, jsonl: true };
  }

  // 15: 数値・真偽値のreference / predictionも捨てずに出す。壊れた行があってもテキストに切り替えられる。
  {
    const preview = await openPreview(desktop, 'eval', 'results.jsonl');
    await preview.locator('.evaluation-samples-table').waitFor();
    const toolbar = await preview.locator('.evaluation-samples-toolbar').innerText();
    assert.match(toolbar, /3件のサンプル/);
    assert.doesNotMatch(toolbar, /読み取れない行/);
    const firstRow = preview.locator('.evaluation-samples-table tbody tr').first();
    assert.equal(await firstRow.locator('td').nth(2).innerText(), '0.1');
    assert.equal(await preview.locator('.evaluation-samples-table mark').count(), 0);
    await screenshot(desktop, 'preview-15-eval-numbers-desktop');
    const mobilePreview = await openPreview(mobile, 'eval', 'results.jsonl');
    await mobilePreview.locator('.evaluation-sample-card').first().waitFor();
    await scrollNearTop(mobilePreview.locator('.evaluation-samples-toolbar'));
    await screenshot(mobile, 'preview-15-eval-numbers-mobile');

    const broken = await openPreview(desktop, 'eval', 'partly-broken.jsonl');
    await broken.locator('.evaluation-samples-table').waitFor();
    assert.match(await broken.locator('.evaluation-samples-toolbar').innerText(), /読み取れない行 1件/);
    assert.equal(await broken.locator('.evaluation-samples-table mark').count(), 2);
    await broken.getByLabel('表示形式').selectOption('auto');
    await broken.locator('.code-view').getByText('"text"', { exact: false }).waitFor();
    results.numericSamples = { samples: 3, brokenRowsCanSwitchToText: true };
  }

  // 22: スマートフォンではサンプルごとに1枚のカードで、scoreを行番号の横に置き、見つからない音声は1行で出す。
  {
    const preview = await openPreview(mobile, 'eval', 'eval-samples.jsonl');
    const cards = preview.locator('.evaluation-sample-card');
    await cards.first().waitFor();
    assert.equal(await cards.count(), 50);
    assert.match(await cards.first().locator('header').innerText(), /1行目\s*score 0/);
    const missing = cards.nth(1).locator('.sample-error');
    await missing.waitFor();
    const lineHeight = await missing.evaluate((element) => parseFloat(getComputedStyle(element).lineHeight) || 18);
    const missingHeight = (await missing.boundingBox()).height;
    assert.ok(missingHeight < lineHeight * 1.5, `missing audio wraps: ${missingHeight}px`);
    await cards.first().locator('audio').waitFor({ state: 'attached' });
    assert.ok(await hasNoSidewaysPageScroll(mobile));
    await scrollNearTop(cards.first());
    await screenshot(mobile, 'preview-22-eval-cards-mobile');
    const wide = await openPreview(desktop, 'eval', 'eval-samples.jsonl');
    await wide.locator('.evaluation-samples-table').waitFor();
    assert.equal(await wide.locator('.evaluation-sample-card').count(), 0);
    await screenshot(desktop, 'preview-22-eval-cards-desktop');
    results.evaluationCards = { cards: 50, missingAudioHeight: missingHeight };
  }

  // 27: 画像を原寸でスクロールする枠の中に出し、枠に合わせた表示へ戻す。
  {
    const preview = await openPreview(desktop, 'samples', 'wide-panorama.png');
    await preview.getByText('2,400 × 300 px').waitFor();
    await preview.getByRole('button', { name: '原寸で表示' }).click();
    const frame = preview.locator('.image-preview-actual');
    await frame.waitFor();
    const sizes = await frame.evaluate((element) => ({
      scrollWidth: element.scrollWidth,
      clientWidth: element.clientWidth,
      imageWidth: element.querySelector('img').getBoundingClientRect().width,
    }));
    assert.ok(sizes.scrollWidth > sizes.clientWidth);
    assert.equal(Math.round(sizes.imageWidth), PANORAMA.width);
    assert.ok(await hasNoSidewaysPageScroll(desktop));
    await frame.evaluate((element) => element.scrollTo(900, 0));
    await screenshot(desktop, 'preview-27-image-actual-desktop');
    await preview.getByRole('button', { name: '枠に合わせる' }).click();
    await preview.locator('.image-preview-fit').waitFor();
    const mobilePreview = await openPreview(mobile, 'samples', 'wide-panorama.png');
    await mobilePreview.getByRole('button', { name: '原寸で表示' }).click();
    await mobilePreview.locator('.image-preview-actual').waitFor();
    assert.ok(await hasNoSidewaysPageScroll(mobile));
    await scrollNearTop(mobilePreview.locator('.image-preview'));
    await screenshot(mobile, 'preview-27-image-actual-mobile');
    results.imageActualSize = sizes;
  }

  // 27: 時間の目盛りは拡大に従い、波形は縦のスワイプを引き続きページに任せる。
  {
    const preview = await openPreview(desktop, 'samples', 'tone-20s.wav');
    const ticks = preview.locator('.audio-time-axis .audio-time-tick');
    await ticks.first().waitFor({ timeout: 30_000 });
    const wholeLabels = (await ticks.allInnerTexts()).filter(Boolean);
    assert.equal(wholeLabels[0], '0:00');
    await preview.getByRole('button', { name: '拡大' }).click();
    await preview.getByRole('button', { name: '拡大' }).click();
    await preview.getByRole('button', { name: '拡大' }).click();
    const rangeText = await preview.locator('.audio-visible-range').innerText();
    assert.match(rangeText, /^表示範囲 0:00\.00–0:02\.50$/);
    const zoomedLabels = (await ticks.allInnerTexts()).filter(Boolean);
    assert.notDeepEqual(zoomedLabels, wholeLabels);
    assert.ok(zoomedLabels.every((label) => /^0:0[0-2]\.\d$/.test(label)), zoomedLabels.join(' '));
    assert.equal(await preview.locator('.audio-timeline').evaluate((element) => getComputedStyle(element).touchAction), 'pan-y pinch-zoom');
    // 拡大した範囲は解析し直すので、その波形を待ってからスクリーンショットを撮る。
    await preview.locator('.audio-timeline-placeholder').waitFor({ state: 'detached', timeout: 30_000 });
    await screenshot(desktop, 'preview-27-audio-axis-desktop');
    const mobilePreview = await openPreview(mobile, 'samples', 'tone-20s.wav');
    await mobilePreview.locator('.audio-time-axis .audio-time-tick').first().waitFor({ timeout: 30_000 });
    await mobilePreview.getByRole('button', { name: '拡大' }).click();
    await mobilePreview.locator('.audio-visible-range').waitFor();
    await mobilePreview.locator('.audio-timeline-placeholder').waitFor({ state: 'detached', timeout: 30_000 });
    await scrollNearTop(mobilePreview.locator('.audio-timeline'));
    assert.ok(await hasNoSidewaysPageScroll(mobile));
    await screenshot(mobile, 'preview-27-audio-axis-mobile');
    results.audioAxis = { whole: wholeLabels, zoomed: zoomedLabels, range: rangeText };
  }

  assert.deepEqual(pageErrors, []);
  console.log(JSON.stringify(results, null, 2));
} finally {
  await browser.close();
  await application.outbox.stop();
  await new Promise((resolve) => (server ? server.close(() => resolve()) : resolve()));
  await database.end();
  await administrator.query(`DROP SCHEMA ${schema} CASCADE`);
  await administrator.end();
  await rm(artifactDirectory, { recursive: true, force: true });
}
