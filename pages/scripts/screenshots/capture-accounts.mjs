// ログイン、Project、ユーザー、アカウント、token、コンピュータのドキュメント用スクリーンショットを、
// seed-accounts.mjsがデータを入れたaccountsの環境（ローカルのログイン）で撮る。
//   node pages/scripts/screenshots/capture-accounts.mjs [--lang en] [name ...]
// 何も作らず、保存もしない。ダイアログは入力してから閉じる。
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { DOCS_VIEWPORT, launchBrowser, newDocsContext, signInLocally } from './browserSession.mjs';
import { labelsFor } from './labels.mjs';
import { outputDirectory, saveScreenshot } from './publishableScreenshot.mjs';
import { runCaptures } from './runCaptures.mjs';
import { environmentDirectory, parseArguments, readEnvironment, readSeedState } from './screenshotEnvironment.mjs';

// tokenのダイアログは900 pxのビューポートより高いので、この2枚の画像で全体を見せる。
const TOKEN_DIALOG_VIEWPORT = { width: DOCS_VIEWPORT.width, height: 1000 };
// メニューやダイアログが開くときの遷移を終え、入力した文字が描かれるまで。
const SHORT_SETTLE_MS = 200;
// コンピュータの詳細が一覧の下に読み込まれ、ページがそこまでスクロールするまで。
const DETAILS_SETTLE_MS = 500;
// ドキュメントがダイアログに入力する値（pages/guide/quickstart.md、pages/admin/projects.md）。
const EXAMPLE_INPUT = {
  ja: {
    quickstartProject: '音声認識の実験',
    privateProject: '話者分離の検証',
    privateProjectDescription: '話者分離モデルの比較。結果を確かめるまで関係者だけで使う。',
    // 名前かユーザー名の先頭。「メンバーを追加」で入力するとおりの文字。
    memberSearches: [{ typed: '青', username: 'aoki' }, { typed: 'ueda', username: 'ueda' }],
  },
  en: {
    quickstartProject: 'speech-recognition',
    privateProject: 'Speaker diarization check',
    privateProjectDescription: 'Comparing speaker diarization models. Only the people involved use it until the results are confirmed.',
    memberSearches: [{ typed: 'Ken', username: 'aoki' }, { typed: 'ueda', username: 'ueda' }],
  },
};

const { options, positional: only } = parseArguments(process.argv.slice(2));
const { lang } = options;
const label = labelsFor(lang);
const input = EXAMPLE_INPUT[lang];
const { webUrl } = await readEnvironment(lang, 'accounts');
const { projectIds, names } = await readSeedState(lang, 'accounts', 'seed-state.json');
const speechRecognition = projectIds.speechRecognition;

const browser = await launchBrowser();
const directory = await outputDirectory(lang);

async function readPassword(username) {
  const file = path.join(environmentDirectory(lang, 'accounts'), `${username}-password`);
  return (await readFile(file, 'utf8')).trim();
}

/** そのユーザーでログインした（またはログインしていない）ページを、指定のルートで開く。 */
async function openAs(username, route, { viewport } = {}) {
  const context = await newDocsContext(browser, { lang, viewport });
  if (username) await signInLocally(context, webUrl, { username, password: await readPassword(username) });
  const page = await context.newPage();
  await page.goto(webUrl + route);
  await page.waitForLoadState('networkidle');
  return page;
}

async function openProjectSwitcher(page) {
  await page.locator('.sidebar-project button').first().click();
  await page.getByRole('listbox').waitFor();
  await page.waitForTimeout(SHORT_SETTLE_MS);
}

// コンピュータの詳細を一覧の下に開く（見るだけ）。
async function openComputerDetails(page, name) {
  await page.getByRole('button', { name, exact: true }).first().click();
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(DETAILS_SETTLE_MS);
  await page
    .getByRole('heading', { name, exact: true })
    .first()
    .evaluate((element) => {
      element.scrollIntoView({ block: 'start' });
      window.scrollBy(0, -24);
    });
  await page.waitForTimeout(DETAILS_SETTLE_MS);
}

const experimentsOf = (projectId) => `/projects/${projectId}/experiments`;

const captures = {
  'guide-login': async () => {
    const page = await openAs(null, '/');
    await page.getByLabel(label.username).waitFor();
    return page;
  },
  'admin-project-switcher': async () => {
    // 一般の利用者には、PublicのProjectと、参加しているPrivateのProjectが見える。
    const page = await openAs('aoki', experimentsOf(speechRecognition));
    await openProjectSwitcher(page);
    return page;
  },
  'guide-projects': async () => {
    const page = await openAs('admin', experimentsOf(speechRecognition));
    await openProjectSwitcher(page);
    await page.getByRole('option').filter({ hasText: label.newProject }).click();
    const dialog = page.getByRole('dialog');
    await dialog.waitFor();
    await dialog.getByLabel(label.name).fill(input.quickstartProject);
    await page.waitForTimeout(SHORT_SETTLE_MS);
    return page;
  },
  'admin-project-create': async () => {
    const page = await openAs('admin', '/settings/projects');
    await page.getByRole('button', { name: label.newProject }).click();
    const dialog = page.getByRole('dialog');
    await dialog.waitFor();
    await dialog.getByLabel(label.name).fill(input.privateProject);
    await dialog.getByLabel(label.projectDescriptionOptional).fill(input.privateProjectDescription);
    await dialog.getByText(label.private, { exact: true }).click();
    const search = dialog.getByRole('searchbox').first();
    for (const { typed, username } of input.memberSearches) {
      const person = dialog.getByRole('button', { name: new RegExp(names.people[username]) }).first();
      await search.fill(typed);
      await person.waitFor();
      await person.click();
    }
    await page.waitForTimeout(SHORT_SETTLE_MS);
    return page;
  },
  'admin-projects': async () => {
    const page = await openAs('admin', '/settings/projects');
    await page.getByLabel(label.projectIncludeArchived).check();
    await page.waitForLoadState('networkidle');
    return page;
  },
  'admin-users': () => openAs('admin', '/settings/users'),
  'admin-account': () => openAs('admin', '/settings/account'),
  'guide-token-dialog': async () => {
    // 「SDK・MLflow 3から接続」から開いたダイアログでは、記録の用途を選んだ状態になる。
    const page = await openAs('admin', `/projects/${speechRecognition}/settings`, { viewport: TOKEN_DIALOG_VIEWPORT });
    await page.getByRole('button', { name: label.recordingConnectionIssueToken }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel(label.name).fill('laptop-sdk');
    await page.waitForTimeout(SHORT_SETTLE_MS);
    return page;
  },
  'admin-token-dialog': async () => {
    const page = await openAs('admin', `/projects/${speechRecognition}/settings`, { viewport: TOKEN_DIALOG_VIEWPORT });
    const serviceAccounts = page
      .locator('.settings-section')
      .filter({ has: page.getByRole('heading', { name: label.serviceAccounts, exact: true }) });
    await serviceAccounts.getByRole('button', { name: label.issueToken }).first().click();
    await page.getByRole('dialog').getByLabel(label.name).fill('gpu-host-1');
    await page.waitForTimeout(SHORT_SETTLE_MS);
    return page;
  },
  'admin-user-menu': async () => {
    // 一般の利用者のメニュー。アカウント、パスワードの変更、全体設定。
    const page = await openAs('aoki', experimentsOf(speechRecognition));
    await page.getByRole('button', { name: label.userMenu }).click();
    await page.getByRole('menu').waitFor();
    await page.waitForTimeout(SHORT_SETTLE_MS);
    return page;
  },
  // 一般の利用者の見え方。ほかの人のPrivateのコンピュータは一覧に出るが、使えない。
  'compute-computers': () => openAs('aoki', '/settings/computers'),
  'compute-site-details': async () => {
    // 一般の利用者が、Jobを本人のアカウントで動かすPublicのsiteを開く。
    const page = await openAs('aoki', '/settings/computers');
    await openComputerDetails(page, 'ABCI');
    return page;
  },
};

try {
  await runCaptures(captures, only, async (name, prepare) => {
    const page = await prepare();
    try {
      await saveScreenshot(page, directory, name, { lang });
    } finally {
      await page.context().close();
    }
  });
} finally {
  await browser.close();
}
