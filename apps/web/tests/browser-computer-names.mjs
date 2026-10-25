// ブラウザでの確認。コンピュータがほかの人のPrivateのものになったJobでも、idそのものではなく
// 名前を出し（名前は全体設定 → コンピュータで公開されている）、削除したコンピュータは削除済みと出す。
import assert from 'node:assert/strict';
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
const context = await browser.newContext({ locale: 'ja-JP', viewport: { width: 1440, height: 900 } });
const api = createBrowserApi();
api.state.loggedIn = true;
await context.route((url) => url.pathname.startsWith('/api/'), api.route);
const page = await context.newPage();
const pageErrors = [];
page.on('pageerror', (error) => pageErrors.push(error.message));
const base = process.env.MMT_WEB_URL ?? 'http://127.0.0.1:5182';
const screenshotDirectory = process.env.MMT_SCREENSHOT_DIR;
const now = '2026-10-12T00:00:00.000Z';

const bobPc = {
  ...api.state.targets[0],
  id: '00000000-0000-4000-8000-0000000c0b01',
  name: 'Bob PC',
  visibility: 'private',
  ownerUserId: '00000000-0000-4000-8000-0000000c0b02',
  ownerName: 'Bob',
};
api.state.targets.push(bobPc);
const DELETED_TARGET_ID = '00000000-0000-4000-8000-0000000c0d01';

const job = (fields) => ({
  projectId: api.state.project.id,
  runId: api.state.runs[0].id,
  status: 'queued',
  gpuIds: [],
  workerId: null,
  leaseId: null,
  cancelRequested: false,
  attempt: 1,
  maxAttempts: 1,
  createdAt: now,
  startedAt: null,
  endedAt: null,
  heartbeatAt: null,
  exitCode: null,
  error: null,
  heartbeatStale: false,
  phase: null,
  gpuCount: 0,
  walltimeSeconds: null,
  schedulerJobId: null,
  submittedAt: null,
  runnerHost: null,
  arrayGroupId: null,
  arrayIndex: null,
  arraySize: null,
  endReason: null,
  parentJobId: null,
  chainDepth: 0,
  hookId: null,
  allowChildJobs: false,
  retryOnFailure: false,
  retryOnTimeout: false,
  datasetPartitionVersionId: null,
  siteJobShellId: null,
  ...fields,
});
api.state.jobs.push(
  job({ id: '00000000-0000-4000-8000-0000000c0a01', targetId: bobPc.id }),
  job({ id: '00000000-0000-4000-8000-0000000c0a02', targetId: DELETED_TARGET_ID }),
);

try {
  await page.goto(`${base}/projects/${api.state.project.id}/jobs`);
  const table = page.locator('table').filter({ hasText: 'コンピュータ' });
  await table.getByText('Bob PC', { exact: true }).waitFor();
  await table.getByText('削除されたコンピュータ', { exact: true }).waitFor();
  assert.equal(await table.getByText(bobPc.id).count(), 0, 'the raw id of a usable-by-others computer is shown');
  assert.equal(await table.getByText(DELETED_TARGET_ID).count(), 0, 'the raw id of a deleted computer is shown');
  if (screenshotDirectory) await page.screenshot({ path: `${screenshotDirectory}/jobs-computer-names.png` });
  assert.deepEqual(pageErrors, []);
  console.log('ok: Jobs name computers that are someone else\'s Private or deleted');
} finally {
  await browser.close();
}
