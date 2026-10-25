// Browser check for phones: at 320px the header and the bell's list stay on screen; the Run list
// keeps the selection, the name and the status in the row and opens the rest; a tab opened from the
// URL is scrolled into view and the hidden end fades; a compared long line of JSON scrolls inside
// its own view; and a vertical swipe on a waveform scrolls the page instead of setting a loop.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { createBrowserApi } from './browserApi.mjs';

const modulePath = process.env.MMT_PLAYWRIGHT_MODULE;
if (!modulePath) throw new Error('Set MMT_PLAYWRIGHT_MODULE to an installed Playwright index.mjs');
const { chromium } = await import(pathToFileURL(modulePath).href);
const browser = await chromium.launch({
  headless: true,
  ...(process.env.MMT_CHROMIUM_PATH ? { executablePath: process.env.MMT_CHROMIUM_PATH } : {}),
  args: ['--no-sandbox'],
});
const base = process.env.MMT_WEB_URL ?? 'http://127.0.0.1:5182';
// The narrowest phone in use (iPhone SE 1st generation; 1280px zoomed to 400%).
const NARROWEST_PHONE = { width: 320, height: 640 };
const PHONE = { width: 390, height: 844 };
const DESKTOP = { width: 1440, height: 900 };
// One line of JSON as wide as the source manifest the comparison opens first (several thousand px).
const MANIFEST_FILE_COUNT = 7;

const api = createBrowserApi();
api.state.loggedIn = true;
const [firstRun, secondRun, thirdRun] = api.state.runs;
const projectId = api.state.project.id;
const projectBase = `${base}/projects/${projectId}`;
let sequence = 8000;
const contents = new Map();
function addArtifact({ run, path, mimeType, body }) {
  const artifact = {
    id: `00000000-0000-4000-8000-${String(sequence++).padStart(12, '0')}`,
    projectId,
    runId: run.id,
    path,
    backend: 'filesystem',
    storageKey: path,
    mimeType,
    size: body.length,
    sha256: '0'.repeat(64),
    createdAt: '2026-10-08T00:00:00Z',
  };
  api.state.artifacts.push(artifact);
  contents.set(artifact.id, { body, mimeType });
}
const manifest = Buffer.from(
  JSON.stringify({
    files: Array.from({ length: MANIFEST_FILE_COUNT }, (_, index) => ({
      path: `src/package_${index}/module_${index}.py`,
      sha256: 'f'.repeat(64),
    })),
  }),
);
addArtifact({ run: firstRun, path: '.mmt/source-manifest.json', mimeType: 'application/json', body: manifest });
addArtifact({ run: secondRun, path: '.mmt/source-manifest.json', mimeType: 'application/json', body: manifest });
const chirp = await readFile(new URL('./fixtures/audio/chirp-16k.wav', import.meta.url));
addArtifact({ run: firstRun, path: 'shared/sample.wav', mimeType: 'audio/wav', body: chirp });
addArtifact({ run: thirdRun, path: 'shared/sample.wav', mimeType: 'audio/wav', body: chirp });
const openAlert = {
  id: '00000000-0000-4000-8000-000000008999',
  projectId,
  kind: 'worker.offline',
  subjectId: 'token:preview-voice-cpu',
  openedAt: '2026-10-11T05:00:00Z',
  resolvedAt: null,
  resolution: null,
  detail: { workerId: 'preview-voice-cpu', hostname: 'gpu-node-01.example.invalid' },
};

async function routeApi(route) {
  const request = route.request();
  const path = new URL(request.url()).pathname;
  const json = (payload, status = 200) =>
    route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(payload) });
  const content = path.match(/\/artifacts\/([^/]+)\/content$/);
  const file = content && contents.get(content[1]);
  if (file) return route.fulfill({ status: 200, contentType: file.mimeType, body: file.body });
  // The real API has no stored media info for these files; the viewer decodes them itself.
  if (path.endsWith('/media-info')) return json({ error: 'Not found', code: 'not_found' }, 404);
  if (path.endsWith('/operations-alerts')) return json({ items: [openAlert] });
  // A previewed file is looked up among the Run's logged media; these Runs logged none.
  if (/\/runs\/[^/]+\/media$/.test(path) && request.method() === 'GET') return json({ items: [] });
  return api.route(route);
}

async function openPhone(viewport) {
  const context = await browser.newContext({ locale: 'ja-JP', viewport, isMobile: true, hasTouch: true });
  await context.route((url) => url.pathname.startsWith('/api/'), routeApi);
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  return { context, page, pageErrors };
}
const documentOverflow = (page) =>
  page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
async function touchDrag(context, page, from, to) {
  const STEPS = 10;
  const touch = await context.newCDPSession(page);
  await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [from] });
  for (let step = 1; step <= STEPS; step += 1)
    await touch.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x: from.x + ((to.x - from.x) * step) / STEPS, y: from.y + ((to.y - from.y) * step) / STEPS }],
    });
  await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

try {
  console.log('Browser check: the header and the bell fit a 320px phone');
  const narrowest = await openPhone(NARROWEST_PHONE);
  let page = narrowest.page;
  await page.goto(`${projectBase}/experiments`);
  await page.locator('.runs-page table').waitFor();
  assert.equal(await documentOverflow(page), 0, 'the page scrolls sideways');
  const brand = page.locator('.topbar .brand');
  assert.equal(await brand.getAttribute('href'), '/');
  // Only the mark shows; the name stays as the link's name for screen readers.
  const hiddenName = brand.locator('.sr-only');
  assert.equal(await hiddenName.textContent(), 'mado ML Tracking');
  assert.ok((await hiddenName.boundingBox()).width <= 1, 'the app name is still drawn');
  // ログアウトはユーザーメニューの中にあるので、上部バーの右端はメニューを開く丸。
  const userMenu = await page.getByRole('button', { name: 'ユーザーメニュー' }).boundingBox();
  assert.ok(userMenu.x + userMenu.width <= NARROWEST_PHONE.width, 'the user menu button is cut off');
  await page.getByRole('button', { name: '運用アラート 1件' }).click();
  const alerts = await page.locator('.operations-alert-popover').boundingBox();
  assert.ok(alerts.x >= 0 && alerts.x + alerts.width <= NARROWEST_PHONE.width, `alerts ${alerts.x}+${alerts.width}`);
  await page.locator('.operations-alert-popover').getByText('preview-voice-cpu').waitFor();
  await page.keyboard.press('Escape');

  console.log('Browser check: the Run list keeps its main columns in the row and opens the rest');
  const runTable = page.locator('.runs-page table');
  assert.deepEqual(
    (await runTable.locator('thead th').allTextContents()).map((header) => header.trim()),
    ['', 'Run名', '状態', '詳細を表示'],
  );
  const firstRow = runTable.locator('tbody tr').filter({ hasText: firstRun.name });
  await firstRow.getByRole('button', { name: '詳細を表示' }).click();
  const details = runTable.locator('.responsive-table-details');
  await details.getByText('作成日時').waitFor();
  assert.ok((await details.locator('dt').allTextContents()).some((name) => name.includes('train/loss')));
  await firstRow.getByRole('checkbox').check();
  await page.locator('.selection-bar').waitFor();
  assert.equal(await runTable.locator('tbody tr.selected').count(), 1);
  const tableBox = await runTable.boundingBox();
  assert.ok(tableBox.x + tableBox.width <= NARROWEST_PHONE.width, 'the Run list is wider than the phone');

  console.log('Browser check: a tab opened from the URL is in view and the hidden ends fade');
  await page.goto(`${projectBase}/runs/${firstRun.id}?tab=logs`);
  const tabList = page.getByRole('tablist').first();
  await tabList.getByRole('tab', { name: 'Logs', selected: true }).waitFor();
  const tabState = await tabList.evaluate((list) => {
    const visible = list.getBoundingClientRect();
    const selected = list.querySelector('[aria-selected="true"]').getBoundingClientRect();
    return { inView: selected.left >= visible.left && selected.right <= visible.right, hiddenEdges: list.dataset.hiddenEdges };
  });
  assert.deepEqual(tabState, { inView: true, hiddenEdges: 'both' });
  assert.deepEqual(narrowest.pageErrors, []);
  await narrowest.context.close();

  console.log('Browser check: a compared long line of JSON scrolls inside its own view');
  const phone = await openPhone(PHONE);
  page = phone.page;
  await page.goto(`${projectBase}/compare?runs=${firstRun.id},${secondRun.id}&tab=artifacts`);
  const code = page.locator('.artifact-compare-item pre.code-view').first();
  await code.waitFor();
  assert.equal(await documentOverflow(page), 0, 'the long line widens the page');
  assert.ok(await code.evaluate((element) => element.scrollWidth > element.clientWidth), 'the line is not scrollable');

  console.log('Browser check: a vertical swipe on a waveform scrolls the page; a sideways drag sets the loop');
  await page.goto(`${projectBase}/compare?runs=${firstRun.id},${thirdRun.id}&tab=artifacts`);
  const timeline = page.locator('.audio-timeline').first();
  await timeline.locator('canvas.audio-waveform').waitFor();
  await timeline.evaluate((element) => element.scrollIntoView({ block: 'center' }));
  const box = await timeline.boundingBox();
  const scrollBefore = await page.evaluate(() => window.scrollY);
  const swipeStart = { x: box.x + box.width / 2, y: box.y + box.height * 0.7 };
  await touchDrag(phone.context, page, swipeStart, { x: swipeStart.x + 20, y: swipeStart.y - 200 });
  await page.waitForFunction((before) => window.scrollY > before, scrollBefore);
  assert.equal(await page.locator('.audio-loop-label').count(), 0, 'a vertical swipe set a loop');
  await timeline.evaluate((element) => element.scrollIntoView({ block: 'center' }));
  const dragBox = await timeline.boundingBox();
  const dragStart = { x: dragBox.x + dragBox.width * 0.2, y: dragBox.y + dragBox.height / 2 };
  await touchDrag(phone.context, page, dragStart, { x: dragBox.x + dragBox.width * 0.6, y: dragStart.y });
  await page.locator('.audio-loop-label').first().waitFor();
  assert.deepEqual(phone.pageErrors, []);
  await phone.context.close();

  console.log('Browser check: wide screens keep the app name and every Run column');
  const desktop = await browser.newContext({ locale: 'ja-JP', viewport: DESKTOP });
  await desktop.route((url) => url.pathname.startsWith('/api/'), routeApi);
  page = await desktop.newPage();
  await page.goto(`${projectBase}/experiments`);
  await page.locator('.runs-page table').waitFor();
  assert.equal((await page.locator('.topbar .brand').innerText()).trim(), 'mado ML Tracking');
  assert.equal(await page.locator('.runs-page table tbody button[aria-expanded]').count(), 0);
  assert.ok((await page.locator('.runs-page table thead th').count()) > 4);
  await desktop.close();
  console.log('Narrow screen browser checks passed.');
} finally {
  await browser.close();
}
