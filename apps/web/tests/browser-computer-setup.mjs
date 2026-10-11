// Browser check of adding and editing an ssh or local computer in two steps (全体設定 → コンピュータ)
// against the isolated mock API (tests/browserApi.mjs, tests/computerSetupMock.mjs): step 1「接続」
// with the SSH key and known_hosts paths offered from the chosen worker's host, the check by that
// worker, step 2「接続後の設定」filled in from the check with the work directory completed from a
// directory the worker reads, a computer set up by hand when the check fails, the dialog without
// workers, and the edit dialog's two tabs and re-check. Also at 390px without horizontal scrolling.
// Start Vite on MMT_WEB_URL first; MMT_SCREENSHOT_DIR, when set, receives the screenshots.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { createBrowserApi } from './browserApi.mjs';

const modulePath = process.env.MMT_PLAYWRIGHT_MODULE;
if (!modulePath) throw new Error('Set MMT_PLAYWRIGHT_MODULE to an installed Playwright index.mjs');
const { chromium } = await import(pathToFileURL(modulePath).href);
const base = process.env.MMT_WEB_URL ?? 'http://127.0.0.1:5182';
const screenshotDirectory = process.env.MMT_SCREENSHOT_DIR;
if (screenshotDirectory) await mkdir(screenshotDirectory, { recursive: true });
// A check finishes on the mock's next read; the dialog reads again every three seconds.
const CHECK_WAIT_MS = 15_000;

const api = createBrowserApi();
api.state.loggedIn = true;
const setup = api.state.computerSetup;
const worker = setup.checkWorkers[0];
const browser = await chromium.launch({
  headless: true,
  args: ['--no-sandbox'],
  ...(process.env.MMT_CHROMIUM_PATH ? { executablePath: process.env.MMT_CHROMIUM_PATH } : {}),
});
const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
await context.route((url) => url.pathname.startsWith('/api/'), api.route);
const page = await context.newPage();
const pageErrors = [];
page.on('pageerror', (error) => pageErrors.push(error.message));

const dialog = () => page.getByRole('dialog').last();
// Required fields carry " *" after their label; the rest of the label must match whole.
const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const field = (label) => dialog().getByLabel(new RegExp(`^${escapeRegExp(label)}(?: \\*)?$`));
const button = (name) => dialog().getByRole('button', { name, exact: true });
const option = (name) => dialog().getByRole('option', { name, exact: false });
const lastCall = (method, pattern) =>
  api.state.calls.filter((call) => call.method === method && pattern.test(call.path)).at(-1);
const screenshot = async (name) => {
  if (screenshotDirectory)
    await page.screenshot({ path: `${screenshotDirectory}/${name}.png`, fullPage: true });
};
// The re-check's request reaches the mock, then its progress gives way to the result.
const waitForNewCheck = async (checksBefore) => {
  while (setup.checks.length === checksBefore) await page.waitForTimeout(100);
  await dialog().getByText('接続を確認しました').waitFor({ timeout: CHECK_WAIT_MS });
};
const openNewComputer = async () => {
  await page.goto(`${base}/settings/computers`);
  await page.getByRole('button', { name: 'コンピュータを追加', exact: true }).click();
  await dialog().getByTestId('computer-connection-step').waitFor();
};

try {
  console.log('Computer setup: step 1 offers the worker key files and checks through the worker');
  await openNewComputer();
  await field('名前').fill('GPU server');
  assert.equal(await dialog().getByRole('radio', { name: /^SSH/ }).isChecked(), true);
  assert.equal(await dialog().getByRole('radio', { name: /^Private/ }).isChecked(), true);
  // The only online worker is chosen by itself.
  assert.equal(await dialog().getByRole('radio', { name: /^ui-worker/ }).isChecked(), true);
  await field('Host').fill('gpu.example.invalid');
  await field('SSHユーザー').fill('mmt');
  await field('SSH鍵のパス').click();
  await option('/home/worker/.ssh/lab.pem').waitFor();
  await option('/home/worker/.ssh/id_ed25519').click();
  assert.equal(await field('SSH鍵のパス').inputValue(), '/home/worker/.ssh/id_ed25519');
  await field('known_hostsのパス').fill('/home/worker/.ssh/kn');
  await option('/home/worker/.ssh/known_hosts').click();
  await screenshot('computer-setup-01-connection');
  await button('接続を確認して次へ').click();
  await dialog().getByTestId('computer-setup-step').waitFor({ timeout: CHECK_WAIT_MS });
  const created = lastCall('POST', /^\/targets$/).body;
  // Saved disabled with the connection only; the setup comes from the check.
  assert.equal(created.enabled, false);
  assert.equal(created.workDirectory, '');
  assert.equal(created.pythonExecutable, '');
  assert.equal(created.sshKeyPath, '/home/worker/.ssh/id_ed25519');
  const gpuServer = api.state.targets.find((target) => target.name === 'GPU server');
  assert.deepEqual(lastCall('POST', /\/checks$/).body, {
    worker: { tokenId: worker.tokenId, workerId: worker.workerId },
  });
  assert.equal(lastCall('POST', /\/checks$/).path, `/targets/${gpuServer.id}/checks`);

  console.log('Computer setup: step 2 is filled in from the check and completes paths');
  await dialog().getByText('接続を確認しました').waitFor();
  await screenshot('computer-setup-02-settings-filled');
  assert.equal(await field('Python実行パス').inputValue(), '/usr/bin/python3');
  assert.equal(await dialog().getByRole('radio', { name: /^amd64/ }).isChecked(), true);
  await dialog().getByText('確認の結果: x86_64').waitFor();
  for (const runtime of ['Python', 'Docker', 'Singularity', 'Apptainer'])
    assert.equal(await dialog().getByRole('checkbox', { name: runtime, exact: true }).isChecked(), true);
  const gpuOne = dialog().getByRole('checkbox', { name: /^1: NVIDIA H100/ });
  assert.equal(await gpuOne.isChecked(), true);
  assert.equal(await field('同時実行数').inputValue(), '2');
  // A login node submits to other machines: one GPU found here, one typed for the compute node.
  await gpuOne.uncheck();
  assert.equal(await field('GPU ID（1行に1件）').inputValue(), '0');
  assert.equal(await field('同時実行数').inputValue(), '1');
  await field('GPU ID（1行に1件）').fill('0\nnode2:0');
  assert.equal(await field('同時実行数').inputValue(), '2');
  // Typed up to a /, the worker reads the directory; hidden entries wait for a typed dot.
  await field('作業ディレクトリ').fill('/home/mmt/');
  await option('/home/mmt/projects/').waitFor({ timeout: CHECK_WAIT_MS });
  await screenshot('computer-setup-03-directory-completion');
  assert.equal(await option('/home/mmt/.venvs/').count(), 0);
  assert.deepEqual(lastCall('POST', /\/directory-listings$/).body, {
    path: '/home/mmt/',
    worker: { tokenId: worker.tokenId, workerId: worker.workerId },
  });
  await field('作業ディレクトリ').fill('/home/mmt/con');
  await option('/home/mmt/container-work/').click();
  await field('Python実行パス').fill('');
  await option('/home/mmt/miniconda3/envs/train/bin/python').click();
  await button('保存').click();
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  const saved = lastCall('PATCH', /^\/targets\/[^/]+$/);
  assert.equal(saved.path, `/targets/${gpuServer.id}`);
  assert.deepEqual(saved.body, {
    workDirectory: '/home/mmt/container-work/',
    pythonExecutable: '/home/mmt/miniconda3/envs/train/bin/python',
    cpuArch: 'amd64',
    runtimeKinds: ['python', 'docker', 'singularity', 'apptainer'],
    gpuIds: ['0', 'node2:0'],
    maxConcurrentJobs: 2,
    datasetTransfer: 'relay',
    datasetCacheMaxBytes: 100 * 1024 ** 3,
    enabled: true,
  });

  console.log('Computer setup: the edit dialog switches tabs and checks again');
  await page.getByTestId(`target-edit-${gpuServer.id}`).click();
  await page.getByRole('tab', { name: '接続', exact: true }).waitFor();
  assert.equal(await field('Host').inputValue(), 'gpu.example.invalid');
  await page.getByRole('tab', { name: '接続後の設定', exact: true }).click();
  assert.equal(await field('作業ディレクトリ').inputValue(), '/home/mmt/container-work/');
  const checksBefore = setup.checks.length;
  await button('再確認').click();
  await waitForNewCheck(checksBefore);
  assert.equal(setup.checks.length, checksBefore + 1);
  await screenshot('computer-setup-04-edit');
  // A changed connection is saved before the worker checks it again.
  await page.getByRole('tab', { name: '接続', exact: true }).click();
  await field('Port').fill('2222');
  await dialog().getByText('保存していない接続の変更は、確認の前に保存します。').waitFor();
  await button('再確認').click();
  await waitForNewCheck(checksBefore + 1);
  const portPatch = lastCall('PATCH', /^\/targets\/[^/]+$/).body;
  assert.equal(portPatch.port, 2222);
  assert.ok(!('workDirectory' in portPatch), 'a re-check saves the connection only');
  await button('キャンセル').click();

  console.log('Computer setup: without an answer from the worker the setup is typed by hand');
  setup.nextCheckResult = null;
  await openNewComputer();
  await field('名前').fill('Login node');
  await field('Host').fill('login.example.invalid');
  await field('SSHユーザー').fill('mmt');
  await field('SSH鍵のパス').fill('/home/worker/.ssh/id_ed25519');
  await field('known_hostsのパス').fill('/home/worker/.ssh/known_hosts');
  await button('接続を確認して次へ').click();
  await dialog()
    .getByText('選んだworkerが確認を受け取りませんでした', { exact: false })
    .waitFor({ timeout: CHECK_WAIT_MS });
  await screenshot('computer-setup-05-no-answer');
  // The failed check may be asked again once the connection is fixed.
  await dialog().locator('button[data-intent="check"]:not([disabled])').waitFor();
  await button('確認せずに次へ').click();
  await dialog().getByTestId('computer-setup-step').waitFor();
  await dialog().getByText('接続確認の結果が無いので', { exact: false }).waitFor();
  await field('作業ディレクトリ').fill('/work/mmt');
  await field('Python実行パス').fill('/usr/bin/python3.11');
  await field('GPU ID（1行に1件）').fill('0\n1\n2\n3');
  await button('保存').click();
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  const loginNode = api.state.targets.find((target) => target.name === 'Login node');
  assert.deepEqual(loginNode.gpuIds, ['0', '1', '2', '3']);
  assert.equal(loginNode.workDirectory, '/work/mmt');
  assert.equal(loginNode.enabled, true);

  console.log('Computer setup: without online workers the dialog says so and goes on by hand');
  setup.checkWorkers = [];
  await openNewComputer();
  await dialog().getByText('接続を確かめられるworkerがオンラインにありません', { exact: false }).waitFor();
  assert.equal(await button('接続を確認して次へ').isDisabled(), true);
  await dialog().getByText('workerを選ぶと、そのworkerのホスト上の鍵が候補に出ます。').first().waitFor();

  console.log('Computer setup: the dialog fits 390px without horizontal scrolling');
  await page.setViewportSize({ width: 390, height: 844 });
  await screenshot('computer-setup-06-narrow');
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  assert.ok(overflow <= 0, `horizontal overflow ${overflow}px`);
  assert.deepEqual(pageErrors, []);
  console.log('Computer setup: passed');
} finally {
  await browser.close();
}
