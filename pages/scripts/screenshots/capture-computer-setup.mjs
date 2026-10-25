// 2段階の「コンピュータを追加」ダイアログのスクリーンショット3枚を、ブラウザテストのモックAPI
// （apps/web/tests/browserApi.mjs）で撮る。こうすると、このマシンに無いGPUやディレクトリを
// workerが報告したことにできる。動いているWebの開発サーバーならどれでもよい。/api/への要求は
// すべてここで答える。
//   node pages/scripts/screenshots/capture-computer-setup.mjs [--lang en] [name ...]
// --web-urlを指定しなければ、見本の環境のWebを使う。
import { createBrowserApi } from '../../../apps/web/tests/browserApi.mjs';
import { launchBrowser, newDocsContext } from './browserSession.mjs';
import { labelsFor } from './labels.mjs';
import { outputDirectory, saveScreenshot } from './publishableScreenshot.mjs';
import { assertKnownCaptures, runCaptures } from './runCaptures.mjs';
import { parseArguments, readEnvironment } from './screenshotEnvironment.mjs';

// モックは次のポーリングで確認を終え、ダイアログは3秒ごとにポーリングする。
const CHECK_WAIT_MS = 15_000;
const EXAMPLE_KEY = '/home/worker/.ssh/mmt_worker_ed25519';
const EXAMPLE_KNOWN_HOSTS = '/home/worker/.ssh/mmt_known_hosts';
const EXAMPLE_WORK_DIRECTORY = '/data/mmt-jobs/';

const { options, positional: only } = parseArguments(process.argv.slice(2));
const { lang } = options;
const label = labelsFor(lang);
const webUrl = options['web-url'] ?? (await readEnvironment(lang, 'sample')).webUrl;

const api = createBrowserApi();
api.state.loggedIn = true;
// ほかの画像と同じく、アバターに「AD」を出す。
api.state.user.displayName = 'admin';
const [existingComputer] = api.state.targets;
Object.assign(existingComputer, {
  name: 'gpu-host-0',
  host: 'gpu-host-0.example.internal',
  username: 'mmt',
  sshKeyPath: EXAMPLE_KEY,
  knownHostsPath: EXAMPLE_KNOWN_HOSTS,
  workDirectory: '/data/mmt-jobs',
});
const setup = api.state.computerSetup;
setup.checkWorkers = [
  {
    ...setup.checkWorkers[0],
    tokenName: 'lab-worker',
    workerId: 'lab-worker-1',
    hostname: 'worker-1.example.internal',
    sshFiles: {
      keyPaths: ['/home/worker/.ssh/id_ed25519', EXAMPLE_KEY],
      knownHostsPaths: ['/home/worker/.ssh/known_hosts', EXAMPLE_KNOWN_HOSTS],
    },
  },
];
// GPUを2つ積み、すべてのRuntimeが動いたサーバー（確認結果のversion 2）。
setup.nextCheckResult = {
  version: 2,
  items: [
    { name: 'connection', status: 'ok', code: null, detail: null },
    { name: 'python', status: 'ok', code: null, detail: '3.12.3 /usr/bin/python3' },
    { name: 'venv', status: 'ok', code: null, detail: null },
    { name: 'pip', status: 'ok', code: null, detail: 'pip 24.0' },
    { name: 'git', status: 'ok', code: null, detail: 'git version 2.43.0' },
    { name: 'docker', status: 'ok', code: null, detail: '27.1.1' },
    { name: 'apptainer', status: 'ok', code: null, detail: '1.3.4' },
    { name: 'singularity', status: 'ok', code: null, detail: '1.3.4' },
    { name: 'gpu', status: 'ok', code: null, detail: '2' },
    { name: 'work_directory', status: 'skipped', code: 'work_directory_not_set', detail: null },
    { name: 'api', status: 'ok', code: null, detail: null },
  ],
  gpus: [
    { index: '0', uuid: 'GPU-example-0', name: 'NVIDIA H100 80GB HBM3', memoryTotalMiB: 81559 },
    { index: '1', uuid: 'GPU-example-1', name: 'NVIDIA H100 80GB HBM3', memoryTotalMiB: 81559 },
  ],
  runtimeKinds: ['python', 'docker', 'singularity', 'apptainer'],
  workDirectoryFreeBytes: null,
  host: { machine: 'x86_64', cpuArch: 'amd64', cpuCount: 64, memoryTotalBytes: 540_000_000_000, homeDirectory: '/home/mmt' },
  pythons: [
    { path: '/usr/bin/python3', version: '3.12.3' },
    { path: '/home/mmt/miniconda3/envs/train/bin/python', version: '3.11.9' },
  ],
  directories: [
    { path: '/home/mmt', source: 'home', writable: true, freeBytes: 1_000_000_000_000 },
    { path: '/data', source: 'mount', writable: true, freeBytes: 9_000_000_000_000 },
  ],
};
// workerが/data/の下で読むもの（ドキュメントの例の作業ディレクトリは/data/mmt-jobs）。
const DOCS_DIRECTORIES = {
  '/data/': [
    { name: 'mmt-jobs', kind: 'directory', executable: true },
    { name: 'datasets', kind: 'directory', executable: true },
    { name: 'shared', kind: 'directory', executable: true },
    { name: 'README.txt', kind: 'file', executable: false },
  ],
};
const LISTING_PATH = /^\/api\/targets\/[^/]+\/directory-listings\/([^/]+)$/;

async function routeApi(route) {
  const request = route.request();
  const match = LISTING_PATH.exec(new URL(request.url()).pathname);
  const listing = match && setup.listings.find((item) => item.id === match[1]);
  const entries = listing && DOCS_DIRECTORIES[listing.path];
  if (request.method() !== 'GET' || !entries) return api.route(route);
  Object.assign(listing, {
    status: 'finished',
    workerId: listing.assignedWorker.workerId,
    finishedAt: listing.createdAt,
    result: { path: listing.path, outcome: 'ok', entries, truncated: false },
  });
  return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(listing) });
}

const browser = await launchBrowser();
const directory = await outputDirectory(lang);
const context = await newDocsContext(browser, { lang });
await context.route((url) => url.pathname.startsWith('/api/'), routeApi);
const page = await context.newPage();
const pageErrors = [];
page.on('pageerror', (error) => pageErrors.push(error.message));

const dialog = () => page.getByRole('dialog').last();
const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// 必須の欄は、ラベルの後ろに" *"が付く。
const field = (name) => dialog().getByLabel(new RegExp(`^${escapeRegExp(name)}(?: \\*)?$`));
const button = (name) => dialog().getByRole('button', { name, exact: true });
const option = (name) => dialog().getByRole('option', { name, exact: false });
const blurActive = () => page.evaluate(() => document.activeElement?.blur());

// 3枚の画像はダイアログを1回通して進める中の各段階なので、それぞれ前の画像の続きから始める。
const captures = {
  'compute-target-dialog': async () => {
    await page.goto(`${webUrl}/settings/computers`);
    await page.getByRole('button', { name: label.newTarget, exact: true }).click();
    await dialog().getByTestId('computer-connection-step').waitFor();
    await field(label.name).fill('gpu-host-1');
    await dialog().getByRole('radio', { name: new RegExp(`^${label.public}`) }).check();
    await field(label.host).fill('gpu-host-1.example.internal');
    await field(label.sshUsername).fill('mmt');
    // 鍵とknown_hostsは、workerが報告したパスから選ぶ。
    await field(label.sshKeyPath).fill('/home/worker/.ssh/');
    await option(EXAMPLE_KEY).click();
    await field(label.knownHostsPath).fill('/home/worker/.ssh/mmt_k');
    await option(EXAMPLE_KNOWN_HOSTS).click();
    await blurActive();
    // 手順1は下の方を見せる。SSHの欄、接続に使うworker、ボタン。
    await button(label.checkAndContinue).scrollIntoViewIfNeeded();
  },
  'compute-target-setup': async () => {
    await button(label.checkAndContinue).click();
    await dialog().getByTestId('computer-setup-step').waitFor({ timeout: CHECK_WAIT_MS });
    await dialog().getByText(label.checkReached).waitFor({ timeout: CHECK_WAIT_MS });
    // 手順2の上の方。確認の結果と、workerが読んだディレクトリからの補完。
    await field(label.workDirectory).fill('/data/');
    await option(EXAMPLE_WORK_DIRECTORY).waitFor({ timeout: CHECK_WAIT_MS });
  },
  'compute-target-setup-gpus': async () => {
    await option(EXAMPLE_WORK_DIRECTORY).click();
    await blurActive();
    // 手順2の下の方。見つかったGPU、手で入力したGPUのID、同時に動かすJobの数。ボタンは見えた
    // ままなので、ダイアログのスクロールする本文を最後まで送る。
    await dialog().evaluate((element) => {
      for (const node of [element, ...element.querySelectorAll('*')])
        if (node.scrollHeight > node.clientHeight) node.scrollTop = node.scrollHeight;
    });
  },
};

assertKnownCaptures(captures, only);
try {
  // どの手順も実行し、名前を指定したものだけを保存する。
  const failed = await runCaptures(captures, [], async (name, prepare) => {
    await prepare();
    if (only.length === 0 || only.includes(name)) await saveScreenshot(page, directory, name, { lang });
  });
  if (failed.length === 0 && pageErrors.length) throw new Error(`page errors: ${pageErrors.join('; ')}`);
} finally {
  await browser.close();
}
