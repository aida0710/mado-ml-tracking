// コンピュータのIDを埋めたコマンドの確認。MMT_WEB_URLのWebの裏に開発モードのAPI
// （MMT_AUTH_MODE=development）を置いて行う。sshのコンピュータの詳細は、管理する人にはIDと、そのIDを
// 入れたworkerのインストールと環境を、使うだけの人にはIDとworkerを設定する人を示す。手動の
// siteの詳細、Jobsの知らせ、起動前の確認は、接続先のURLを入れたsubmitコマンド、そのコマンドの
// インストール方法、tokenをどこでどのscopeで発行するか（token自体は出さない）を示す。Jobsの画面の
// tokenのボタンはreadとjobs:writeのtokenを発行し、Viewerにはボタンが出ない。390pxではどの画面も
// 横にスクロールしない。MMT_SCREENSHOT_DIRを設定すると、そこにスクリーンショットを保存する。
import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const modulePath = process.env.MMT_PLAYWRIGHT_MODULE;
if (!modulePath) throw new Error('Set MMT_PLAYWRIGHT_MODULE to an installed Playwright index.mjs');
const { chromium } = await import(pathToFileURL(modulePath).href);
const base = process.env.MMT_WEB_URL ?? 'http://127.0.0.1:5182';
const adminEmail = process.env.MMT_DEVELOPMENT_ADMIN_EMAIL ?? 'admin@localhost';
const outputDirectory = process.env.MMT_SCREENSHOT_DIR;
if (outputDirectory) await mkdir(outputDirectory, { recursive: true });
// 実行ごとにユーザー、Project、コンピュータを作るので、実行どうしで互いの記録が見えない。
const runKey = Date.now().toString(36);
const DESKTOP = { width: 1440, height: 1000 };
const PHONE = { width: 390, height: 844 };
const DOCKER_IMAGE = `registry.example.invalid/mmt/guide@sha256:${'b'.repeat(64)}`;
const jobShell = await readFile(
  new URL('../../../deploy/sites/examples/direct-docker/job.sh', import.meta.url),
  'utf8',
);

const browser = await chromium.launch({
  headless: true,
  ...(process.env.MMT_CHROMIUM_PATH ? { executablePath: process.env.MMT_CHROMIUM_PATH } : {}),
  args: ['--no-sandbox'],
});
const pageErrors = [];

async function signIn(email, displayName, viewport = DESKTOP) {
  const context = await browser.newContext({ locale: 'ja-JP', viewport });
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: base });
  const login = await context.request.post(`${base}/api/auth/dev-login`, {
    headers: { Origin: base },
    data: { email, displayName },
  });
  assert.equal(login.ok(), true, `dev-login ${email}: ${login.status()}`);
  const { user } = await login.json();
  const call = async (method, path, data) => {
    const response = await context.request.fetch(`${base}/api${path}`, {
      method,
      headers: { Origin: base },
      ...(data ? { data } : {}),
    });
    assert.equal(response.ok(), true, `${method} ${path}: ${response.status()} ${await response.text()}`);
    return response.status() === 204 ? null : response.json();
  };
  const page = await context.newPage();
  page.on('pageerror', (error) => pageErrors.push(error.message));
  return { context, page, user, get: (path) => call('GET', path), post: (path, data) => call('POST', path, data), put: (path, data) => call('PUT', path, data) };
}

const clipboard = (page) => page.evaluate(() => navigator.clipboard.readText());
async function copySnippet(page, scope, label) {
  await scope.locator('.code-snippet', { hasText: label }).getByRole('button', { name: 'コピー' }).click();
  return clipboard(page);
}
async function copyValue(page, scope) {
  await scope.getByRole('button', { name: 'コピー' }).first().click();
  return clipboard(page);
}
async function assertNoSidewaysScroll(page, where) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  assert.ok(overflow <= 0, `${where} scrolls sideways by ${overflow}px at 390px`);
}
async function screenshot(page, name, options = {}) {
  if (outputDirectory) await page.screenshot({ path: `${outputDirectory}/${name}.png`, ...options });
}
/** submitの準備の説明は、tokenの入手先を示し、このページのURLへ接続させる。 */
async function assertSubmitSetup(page, scope) {
  const setup = scope.locator('details.submit-cli-setup');
  await setup.locator('summary').click();
  await setup
    .getByText('API tokenは、Jobを作ったプロジェクトの［プロジェクト設定］→「自分のAPI token」の［API tokenを発行］で、readとjobs:writeを選んで発行します。')
    .waitFor();
  const environment = await copySnippet(page, setup, '接続先とAPI token');
  assert.equal(
    environment,
    `export MMT_API_URL=${base}\nprintf 'API token: '; read -r -s MMT_API_TOKEN; echo\nexport MMT_API_TOKEN\n`,
  );
  assert.match(
    await copySnippet(page, setup, 'mado-trackingを入れて'),
    /pip install 'mado-tracking @ git\+https:\/\/github\.com\/aida0710\/mado-ml-tracking\.git#subdirectory=python'\nexport PATH="\$HOME\/\.venvs\/mado-tracking\/bin:\$PATH"\n$/,
  );
  return setup;
}

try {
  console.log('Setup: users, a Project with an Experiment, an ssh computer and a manual site with a waiting Job');
  const admin = await signIn(adminEmail, '全体管理者');
  assert.equal(admin.user.isAdmin, true, `${adminEmail} must be MMT_DEVELOPMENT_ADMIN_EMAIL`);
  const editor = await signIn(`guide-editor-${runKey}@localhost`, '研究者A');
  const viewer = await signIn(`guide-viewer-${runKey}@localhost`, '閲覧者B');
  const project = await admin.post('/projects', { name: `案内の確認 ${runKey}`, visibility: 'private' });
  await admin.put(`/projects/${project.id}/members/${editor.user.id}`, { role: 'editor' });
  await admin.put(`/projects/${project.id}/members/${viewer.user.id}`, { role: 'viewer' });
  const experiment = await admin.post(`/projects/${project.id}/experiments`, { name: '音声認識-baseline' });
  const ssh = await admin.post('/targets', {
    name: `GPUサーバー ${runKey}`,
    executor: 'ssh',
    visibility: 'public',
    host: 'gpu-a.lab.example',
    port: 22,
    username: 'mmt',
    sshKeyPath: '~/.ssh/id_ed25519',
    knownHostsPath: '~/.ssh/known_hosts',
    workDirectory: '',
    pythonExecutable: '',
    runtimeKinds: ['python'],
    gpuIds: [],
    maxConcurrentJobs: 1,
    enabled: false,
  });
  const site = await editor.post('/targets', {
    name: `研究室のPC ${runKey}`,
    executor: 'site',
    visibility: 'public',
    submissionMode: 'manual',
    host: '',
    port: 22,
    username: '',
    sshKeyPath: '',
    knownHostsPath: '',
    workDirectory: '',
    pythonExecutable: '',
    runtimeKinds: ['docker'],
    gpuIds: [],
    maxConcurrentJobs: 1,
    enabled: true,
  });
  await editor.post(`/targets/${site.id}/job-shells`, { content: jobShell });
  const code = await admin.post(`/projects/${project.id}/codes`, { name: 'asr-train' });
  const codeVersion = await admin.post(`/projects/${project.id}/codes/${code.id}/versions`, {
    version: 'docker-v1',
    runtime: { kind: 'docker', image: DOCKER_IMAGE },
    entrypoint: ['python', 'train.py'],
    supportedModelFamilies: ['asr'],
    taskTypes: ['training'],
  });
  const run = await editor.post(`/projects/${project.id}/runs`, {
    experimentId: experiment.id,
    name: 'asr-lr-0.05',
    kind: 'training',
    codeVersionId: codeVersion.id,
  });
  const job = await editor.post(`/projects/${project.id}/jobs`, { runId: run.id, targetId: site.id });

  console.log('ssh computer: its ID and the worker commands with that ID');
  await admin.page.goto(`${base}/settings/computers`);
  await admin.page.getByRole('button', { name: ssh.name, exact: true }).click();
  const summary = admin.page.getByTestId('computer-summary');
  assert.equal(await copyValue(admin.page, summary), ssh.id);
  const workerSetup = admin.page.getByTestId('worker-setup');
  const service = await copySnippet(admin.page, workerSetup, 'systemdで常駐させる');
  assert.match(service, new RegExp(`--api-url ${base} \\\\\n`));
  assert.match(service, new RegExp(`--target-ids ${ssh.id}\n`));
  assert.match(service, /--worker-id "\$\(hostname -s\)"/);
  await workerSetup.locator('summary').click();
  const workerEnvironment = await copySnippet(admin.page, workerSetup, '環境変数（tokenは実行時に入力）');
  assert.match(workerEnvironment, new RegExp(`export MMT_WORKER_TARGET_IDS=${ssh.id}\n`));
  assert.doesNotMatch(workerEnvironment, /MMT_API_TOKEN=/);
  await workerSetup.scrollIntoViewIfNeeded();
  await screenshot(admin.page, '01-ssh-computer-worker-setup', { fullPage: true });

  console.log('ssh computer: one who only uses it gets its ID and who sets the worker up, not the setup');
  const workerSetUpBy = `所有者（${admin.user.displayName}さん）か全体管理者が設定します。`;
  await editor.page.goto(`${base}/settings/computers`);
  await editor.page.getByRole('button', { name: ssh.name, exact: true }).click();
  const editorSummary = editor.page.getByTestId('computer-summary');
  assert.equal(await copyValue(editor.page, editorSummary), ssh.id);
  assert.equal(await editorSummary.getByTestId('worker-set-up-by').textContent(), workerSetUpBy);
  assert.equal(await editor.page.getByTestId('worker-setup').count(), 0);
  await screenshot(editor.page, '07-ssh-computer-non-manager', { fullPage: true });

  console.log('Manual site: its ID, the submit commands and the setup with this URL');
  await editor.page.goto(`${base}/settings/computers`);
  await editor.page.getByRole('button', { name: site.name, exact: true }).click();
  const siteDetails = editor.page.getByTestId('site-computer-details');
  assert.equal(await copyValue(editor.page, siteDetails.locator('.copyable-value', { hasText: 'コンピュータID' })), site.id);
  await siteDetails.getByText(`mado-tracking submit --site ${site.id}`, { exact: true }).waitFor();
  await assertSubmitSetup(editor.page, siteDetails);
  await screenshot(editor.page, '02-site-details-setup', { fullPage: true });

  console.log('Jobs: the waiting Job, its setup and the token button with read and jobs:write');
  await editor.page.goto(`${base}/projects/${project.id}/jobs?job=${job.id}`);
  const notice = editor.page.locator('section.manual-submission');
  await notice.waitFor();
  const setup = await assertSubmitSetup(editor.page, notice);
  await screenshot(editor.page, '03-jobs-notice-setup');
  await setup.getByRole('button', { name: '投入用のAPI tokenを発行' }).click();
  const tokenDialog = editor.page.getByRole('dialog');
  const selectedScopes = await tokenDialog
    .locator('select[multiple] option:checked, input[type=checkbox]:checked')
    .evaluateAll((elements) => elements.map((element) => element.value || element.getAttribute('value')));
  assert.deepEqual(selectedScopes.sort(), ['jobs:write', 'read']);
  await tokenDialog.getByLabel('名前').fill(`submit-${runKey}`);
  await tokenDialog.getByRole('button', { name: '保存' }).click();
  await tokenDialog.getByText('API tokenは一度だけ表示されます', { exact: false }).waitFor();
  await tokenDialog.getByRole('button', { name: '閉じる' }).last().click();
  const issued = (await editor.get('/tokens')).items.find((token) => token.name === `submit-${runKey}`);
  assert.deepEqual([...issued.scopes].sort(), ['jobs:write', 'read']);
  assert.equal(issued.projectId, project.id);

  console.log('Launch: the review step on the manual site says the Job waits, with the command');
  await editor.page.goto(`${base}/projects/${project.id}/jobs`);
  await editor.page.getByRole('button', { name: 'ジョブを起動', exact: true }).click();
  const launch = editor.page.getByRole('dialog');
  await launch.getByLabel('Run名').fill('asr-lr-0.1');
  await launch.getByLabel('Experiments').selectOption(experiment.id);
  await launch.getByLabel('実行種別').selectOption('training');
  await launch.getByLabel('コードバージョン').selectOption(codeVersion.id);
  await launch.getByRole('button', { name: '次へ', exact: true }).click();
  await launch.getByLabel('コンピュータ').selectOption(site.id);
  await launch.getByRole('button', { name: '次へ', exact: true }).click();
  await launch.getByText('このコンピュータは手動投入です。', { exact: false }).waitFor();
  await launch.getByText(`mado-tracking submit --site ${site.id}`, { exact: true }).waitFor();
  await screenshot(editor.page, '04-launch-review-manual');
  await launch.getByRole('button', { name: 'キャンセル', exact: true }).click();

  console.log('Viewer: the setup is there, the token button is not');
  await viewer.page.goto(`${base}/projects/${project.id}/jobs?job=${job.id}`);
  const viewerNotice = viewer.page.locator('section.manual-submission');
  await viewerNotice.waitFor();
  await viewerNotice.locator('details.submit-cli-setup summary').click();
  assert.equal(await viewer.page.getByRole('button', { name: '投入用のAPI tokenを発行' }).count(), 0);

  console.log('390px: the Experiment guide and the computer details do not scroll sideways');
  const phone = await signIn(`guide-editor-${runKey}@localhost`, '研究者A', PHONE);
  await phone.page.goto(`${base}/projects/${project.id}/experiments?experiment=${experiment.id}`);
  await phone.page.getByRole('heading', { name: experiment.name }).waitFor();
  await phone.page.getByRole('button', { name: 'SDKで記録' }).click();
  await phone.page.locator('section.recording-connection').waitFor();
  await assertNoSidewaysScroll(phone.page, 'Experiments with the SDK guide');
  await screenshot(phone.page, '05-phone-experiment-guide', { fullPage: true });
  await phone.page.goto(`${base}/settings/computers`);
  await phone.page.getByRole('button', { name: site.name, exact: true }).click();
  await phone.page.getByTestId('site-computer-details').locator('details.submit-cli-setup summary').click();
  await assertNoSidewaysScroll(phone.page, 'the manual site details');
  await phone.page.getByRole('button', { name: ssh.name, exact: true }).click();
  await phone.page.getByTestId('worker-set-up-by').waitFor();
  assert.equal(await phone.page.getByTestId('worker-setup').count(), 0);
  await assertNoSidewaysScroll(phone.page, 'the ssh computer details');
  await screenshot(phone.page, '06-phone-ssh-computer', { fullPage: true });
  const phoneAdmin = await signIn(adminEmail, '全体管理者', PHONE);
  await phoneAdmin.page.goto(`${base}/settings/computers`);
  await phoneAdmin.page.getByRole('button', { name: ssh.name, exact: true }).click();
  await phoneAdmin.page.getByTestId('worker-setup').waitFor();
  await assertNoSidewaysScroll(phoneAdmin.page, 'the ssh computer details of its manager');
  await screenshot(phoneAdmin.page, '08-phone-ssh-computer-manager', { fullPage: true });

  assert.deepEqual(pageErrors, []);
  console.log('computer guides: ok');
} finally {
  await browser.close();
}
