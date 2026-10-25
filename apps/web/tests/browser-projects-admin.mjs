// 分離したモックのAPI（tests/browserApi.mjs）でProjectまわりをブラウザで確かめる: Projectの
// サイドバーの「プロジェクト管理」の組（全体設定と全体管理の組はそれぞれの画面にだけ出る）、
// Projectの切り替え（キーボード、絞り込み、ウィンドウ内に収まること、狭い画面のProjectの帯、
// 両方のテーマ、絞り込みでの日本語入力、中を押したときの動き）、メンバー付きのPrivateなProjectの
// 作成（メンバー検索でのEnter、選んだあとのフォーカス）、Projectの設定からのメンバーの追加、
// 全体管理 → プロジェクト（409になるアーカイブ、アーカイブ済みの行、元に戻す、名前を打って確かめる
// 完全削除）、Projectの設定からのアーカイブ、filesystemのルートで出すサーバーのディレクトリ候補。
// 先にMMT_WEB_URLでViteを起動しておく。MMT_SCREENSHOT_DIRを設定すると、そこへスクリーンショットを保存する。
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { createBrowserApi } from './browserApi.mjs';
import { openProjectSwitcher, projectSwitcherButton } from './projectSwitcher.mjs';

const modulePath = process.env.MMT_PLAYWRIGHT_MODULE;
if (!modulePath) throw new Error('Set MMT_PLAYWRIGHT_MODULE to an installed Playwright index.mjs');
const { chromium } = await import(pathToFileURL(modulePath).href);
const base = process.env.MMT_WEB_URL ?? 'http://127.0.0.1:5182';
const screenshotDirectory = process.env.MMT_SCREENSHOT_DIR;
if (screenshotDirectory) await mkdir(screenshotDirectory, { recursive: true });
// Projectがこの数以上あると、切り替えに絞り込みが出る（PROJECT_FILTER_THRESHOLD）。
const PROJECT_FILTER_THRESHOLD = 8;
const WIDE = { width: 1440, height: 900 };
const NARROW = { width: 390, height: 844 };
// 入力メソッドが処理したキーについて、ChromeとSafariがkeyCodeとして報告する値。
const IME_PROCESS_KEY_CODE = 229;

const isFocused = (locator) => locator.evaluate((element) => element === document.activeElement);

/**
 * 日本語を変換中の入力メソッドと同じようにキーを送る。Playwrightは入力メソッドを操作できない
 * ので、本物と同じくkeydownにisComposing（またはkeyCode 229）を持たせる。
 */
const pressComposingKey = (locator, { key, isComposing = true, keyCode }) =>
  locator.evaluate(
    (element, init) =>
      element.dispatchEvent(
        new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init }),
      ),
    { key, isComposing, ...(keyCode ? { keyCode } : {}) },
  );
const dispatchComposition = (locator, type, data) =>
  locator.evaluate(
    (element, { type, data }) =>
      element.dispatchEvent(new CompositionEvent(type, { bubbles: true, data })),
    { type, data },
  );

const api = createBrowserApi();
api.state.loggedIn = true;
const projects = api.state.projectAdministration;
const addProject = ({ name, visibility = 'public', role = 'editor' }) => {
  const project = {
    id: `00000000-0000-4000-8000-0000000b${String(projects.projects.length).padStart(4, '0')}`,
    name,
    description: '',
    artifactBackend: 'filesystem',
    visibility,
    role,
    isMember: true,
    createdAt: '2026-10-09T00:00:00Z',
    archivedAt: null,
    memberCount: 2,
    adminNames: ['青木 研究員'],
    runCount: 0,
  };
  projects.projects.push(project);
  return project;
};
const vision = addProject({ name: 'Vision 評価' });
const tts = addProject({ name: 'TTS 本番', visibility: 'private', role: 'viewer' });

// 保存先の画面の一覧。ディレクトリの候補は共有のモックが返す。
async function routeApi(route) {
  const path = new URL(route.request().url()).pathname.replace(/^\/api/, '');
  const reply = (payload) =>
    route.fulfill({ contentType: 'application/json', body: JSON.stringify(payload) });
  if (path === '/admin/storage-backends') return reply({ items: [] });
  if (path === '/admin/storage-settings') return reply({ defaultBackend: 'filesystem' });
  return api.route(route);
}

const browser = await chromium.launch({
  headless: true,
  args: ['--no-sandbox'],
  ...(process.env.MMT_CHROMIUM_PATH ? { executablePath: process.env.MMT_CHROMIUM_PATH } : {}),
});
const pageErrors = [];
try {
  const context = await browser.newContext({ locale: 'ja-JP', viewport: WIDE });
  await context.route((url) => url.pathname.startsWith('/api/'), routeApi);
  const page = await context.newPage();
  page.on('pageerror', (error) => pageErrors.push(error.message));
  const screenshot = async (name, options = {}) => {
    if (screenshotDirectory)
      await page.screenshot({ path: `${screenshotDirectory}/${name}.png`, ...options });
  };
  const dialog = () => page.getByRole('dialog');
  const mainProject = api.state.project;

  console.log('Projects: a Project sidebar ends with Project management, without 全体設定 or 全体管理');
  await page.goto(`${base}/projects/${mainProject.id}/experiments`);
  const sidebar = page.locator('.navigation-sidebar');
  await sidebar.getByRole('group', { name: 'プロジェクト管理' }).waitFor();
  await sidebar.getByRole('link', { name: 'プロジェクト設定', exact: true }).waitFor();
  // 全体設定はユーザーメニューから開く。Projectのサイドバーからは開かない。
  assert.equal(await sidebar.getByRole('group', { name: '全体設定', exact: true }).count(), 0);
  assert.equal(await sidebar.getByRole('group', { name: '全体管理', exact: true }).count(), 0);

  console.log('Projects: the switcher opens on the open Project and moves with the keys');
  await projectSwitcherButton(page).focus();
  await page.keyboard.press('ArrowDown');
  const listbox = page.getByRole('listbox', { name: 'プロジェクト', exact: true });
  await listbox.waitFor();
  assert.equal(await listbox.evaluate((element) => element === document.activeElement), true);
  const activeOption = async () =>
    listbox.evaluate((element) =>
      document.getElementById(element.getAttribute('aria-activedescendant'))?.textContent,
    );
  assert.match(await activeOption(), /UI検証用プロジェクト/);
  assert.equal(
    await listbox.getByRole('option', { selected: true }).innerText().then((value) => value.trim()),
    await listbox.getByRole('option').first().innerText().then((value) => value.trim()),
  );
  await listbox.getByRole('option', { name: /TTS 本番/ }).locator('.lucide-lock').waitFor();
  await page.keyboard.press('End');
  assert.match(await activeOption(), /プロジェクトを作成/);
  await page.keyboard.press('ArrowDown');
  assert.match(await activeOption(), /UI検証用プロジェクト/);
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('Home');
  assert.match(await activeOption(), /UI検証用プロジェクト/);
  // ドロップダウンはサイドバーより広く、ウィンドウの中に収まる。
  const box = await page.locator('.project-switcher-popover').boundingBox();
  assert.ok(box.x >= 0 && box.x + box.width <= WIDE.width && box.y + box.height <= WIDE.height);
  await screenshot('01-switcher-sidebar-light');
  await page.keyboard.press('Escape');
  await listbox.waitFor({ state: 'detached' });
  assert.equal(
    await projectSwitcherButton(page).evaluate((element) => element === document.activeElement),
    true,
    'Esc returns the focus to the switcher button',
  );
  await page.keyboard.press('Enter');
  await listbox.waitFor();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await page.waitForURL(`${base}/projects/${vision.id}/experiments`);
  await projectSwitcherButton(page).getByText('Vision 評価').waitFor();

  console.log('Projects: the sidebar is dark in both themes; the dropdown keeps the page colors');
  await page.getByRole('button', { name: 'ダークテーマ', exact: true }).click();
  await openProjectSwitcher(page);
  await screenshot('02-switcher-sidebar-dark');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'ライトテーマ', exact: true }).click();

  console.log('Projects: from eight Projects a filter narrows the list');
  for (let index = projects.projects.length; index < PROJECT_FILTER_THRESHOLD; index += 1)
    addProject({ name: `音声実験 ${index}` });
  await page.reload();
  await openProjectSwitcher(page);
  const filter = page.getByRole('combobox', { name: 'プロジェクトを絞り込み' });
  assert.equal(await isFocused(filter), true);

  console.log('Projects: the keys of a Japanese conversion in the filter stay with the input method');
  const activeFilterOption = () =>
    filter.evaluate(
      (element) =>
        document.getElementById(element.getAttribute('aria-activedescendant'))?.textContent,
    );
  const urlBeforeComposition = page.url();
  await dispatchComposition(filter, 'compositionstart', '');
  await page.keyboard.insertText('音声');
  await listbox.getByRole('option', { name: /音声実験 3/ }).waitFor();
  const optionWhileComposing = await activeFilterOption();
  await pressComposingKey(filter, { key: 'ArrowDown' });
  assert.equal(await activeFilterOption(), optionWhileComposing, '↓ moves the conversion only');
  await pressComposingKey(filter, { key: 'Enter' });
  await dispatchComposition(filter, 'compositionend', '音声');
  // Safariは変換を確定するEnterを、compositionendのあとにkeyCode 229で送る。
  await pressComposingKey(filter, {
    key: 'Enter',
    isComposing: false,
    keyCode: IME_PROCESS_KEY_CODE,
  });
  assert.equal(page.url(), urlBeforeComposition, 'confirming the conversion chooses nothing');
  await listbox.waitFor();
  assert.equal(await filter.inputValue(), '音声');
  // 変換中でなければ、同じキーで実際に移動し、選べる。
  await pressComposingKey(filter, { key: 'ArrowDown', isComposing: false });
  assert.notEqual(await activeFilterOption(), optionWhileComposing);

  console.log('Projects: pressing inside the dropdown away from the rows keeps it open');
  const popover = page.locator('.project-switcher-popover');
  // 絞り込みの周りの余白を押し、次に一致するものが無いときに出る行を押す。
  await popover.click({ position: { x: 3, y: 3 } });
  assert.equal(await popover.isVisible(), true, 'pressing the padding keeps the dropdown open');
  assert.equal(await isFocused(filter), true, 'the focus stays in the filter');
  await filter.fill('一致しない名前');
  await popover.getByText('一致する項目がありません', { exact: true }).click();
  assert.equal(await popover.isVisible(), true, 'pressing the empty line keeps it open');
  assert.equal(await isFocused(filter), true, 'the focus stays in the filter');
  await filter.fill('tts');
  assert.deepEqual(
    (await listbox.getByRole('option').allInnerTexts()).map((value) => value.split('\n')[0].trim()),
    ['TTS 本番', 'プロジェクトを作成'],
  );
  await screenshot('03-switcher-filter');
  await page.keyboard.press('Enter');
  await page.waitForURL(`${base}/projects/${tts.id}/experiments`);

  console.log('Projects: create a Private Project with members from the switcher');
  const switcher = await openProjectSwitcher(page);
  await switcher.getByRole('option', { name: 'プロジェクトを作成', exact: true }).click();
  await dialog().getByLabel('名前').fill('話者分離 検証');
  await dialog().getByLabel('説明（任意）').fill('ブラウザ検証で作成');
  assert.equal(await dialog().getByRole('radio', { name: /^Public/ }).isChecked(), true);
  assert.equal(await dialog().getByRole('group', { name: 'メンバー（任意）' }).count(), 0);
  await dialog().getByRole('radio', { name: /^Private/ }).check();
  const members = dialog().getByRole('group', { name: 'メンバー（任意）' });
  const memberSearch = members.getByLabel('メンバーを追加');
  // 検索欄でEnterを押してもフォームは送信しない。見つかった利用者が1人ならその人を選ぶ。
  const createRequestCount = projects.createRequests.length;
  await memberSearch.fill('研究員');
  await members.getByRole('button', { name: /上田 研究員/ }).waitFor();
  await memberSearch.press('Enter');
  assert.equal(projects.createRequests.length, createRequestCount, 'Enter does not create');
  await members.getByRole('button', { name: /上田 研究員/ }).waitFor();
  assert.equal(await members.getByRole('combobox').count(), 0, 'no member is added yet');
  await memberSearch.fill('青木');
  await members.getByRole('button', { name: /青木 研究員/ }).waitFor();
  await memberSearch.press('Enter');
  await members.getByLabel('青木 研究員のRole').waitFor();
  assert.equal(await memberSearch.inputValue(), '');
  assert.equal(await isFocused(memberSearch), true, 'the search keeps the focus after a pick');
  // キーボードで選んだ候補からは、フォーカスが検索欄へ戻る。
  await memberSearch.fill('研究員');
  await members.getByRole('button', { name: /石井 研究員/ }).focus();
  await page.keyboard.press('Enter');
  await members.getByLabel('石井 研究員のRole').waitFor();
  assert.equal(await isFocused(memberSearch), true, 'the focus returns to the search');
  assert.equal(projects.createRequests.length, createRequestCount);
  await members.getByLabel('青木 研究員のRole').selectOption('viewer');
  assert.equal(await members.getByLabel('石井 研究員のRole').inputValue(), 'editor');
  await screenshot('04-create-private-with-members');
  await members.getByRole('button', { name: '石井 研究員を外す' }).click();
  await dialog().getByRole('button', { name: '作成', exact: true }).click();
  await page.waitForURL(/\/projects\/[^/]+\/experiments$/);
  const createRequest = projects.createRequests.at(-1);
  assert.equal(createRequest.visibility, 'private');
  assert.deepEqual(createRequest.members, [
    { userId: '00000000-0000-4000-8000-00000000a001', role: 'viewer' },
  ]);
  await projectSwitcherButton(page).getByText('話者分離 検証').waitFor();

  console.log('Projects: 全体管理 → プロジェクト lists, archives, restores and purges');
  // 以前の/adminも引き続きProjectの一覧を開く。今は/settings/projectsにある。
  await page.goto(`${base}/admin`);
  await page.waitForURL(`${base}/settings/projects`);
  await page.getByRole('heading', { name: 'プロジェクト', exact: true }).waitFor();
  await page.locator('.page-header .eyebrow').getByText('全体管理').waitFor();
  const visionRow = () => page.getByRole('row', { name: /Vision 評価/ });
  await visionRow().getByRole('button', { name: 'アーカイブ', exact: true }).click();
  projects.activeJobsBlockArchive = true;
  await dialog().getByText(/Run・モデル・Artifactのデータは残り/).waitFor();
  await dialog().getByRole('button', { name: 'アーカイブ', exact: true }).click();
  await dialog().getByRole('alert').getByText(/待機中または実行中のJobがある/).waitFor();
  await screenshot('05-archive-blocked-by-jobs');
  await dialog().getByRole('button', { name: 'アーカイブ', exact: true }).click();
  await dialog().waitFor({ state: 'detached' });
  await visionRow().waitFor({ state: 'detached' });
  await page.getByLabel('アーカイブ済みも表示').check();
  await visionRow().getByText('アーカイブ済み').waitFor();
  assert.equal(await visionRow().getByRole('link').count(), 0, 'an archived Project does not open');
  await screenshot('06-admin-projects-with-archived', { fullPage: true });
  await visionRow().getByRole('button', { name: '元に戻す', exact: true }).click();
  await dialog().getByRole('button', { name: '元に戻す', exact: true }).click();
  await visionRow().getByText('有効', { exact: true }).waitFor();
  await visionRow().getByRole('button', { name: 'アーカイブ', exact: true }).click();
  await dialog().getByRole('button', { name: 'アーカイブ', exact: true }).click();
  await visionRow().getByRole('button', { name: '完全に削除', exact: true }).click();
  const purge = page.getByRole('dialog', { name: 'プロジェクトを完全に削除' });
  await purge.getByText(/元に戻せません/).waitFor();
  const purgeButton = purge.getByRole('button', { name: '完全に削除', exact: true });
  assert.equal(await purgeButton.isDisabled(), true);
  await purge.getByLabel('確認のため、プロジェクト名を入力してください').fill('Vision');
  assert.equal(await purgeButton.isDisabled(), true);
  await purge.getByLabel('確認のため、プロジェクト名を入力してください').fill('Vision 評価');
  await screenshot('07-purge-confirmed-by-name');
  await purgeButton.click();
  await purge.waitFor({ state: 'detached' });
  await visionRow().waitFor({ state: 'detached' });
  assert.equal(projects.projects.some((project) => project.id === vision.id), false);

  console.log('Projects: archiving from the Project settings says so on the Project list');
  await page.goto(`${base}/projects/${tts.id}/settings`);
  await page.getByRole('heading', { name: 'プロジェクト設定', exact: true }).waitFor();
  // viewerは公開範囲を変えられず、アーカイブもできない。
  assert.equal(await page.getByRole('radio', { name: /^Private/ }).isDisabled(), true);
  assert.equal(await page.getByRole('heading', { name: 'プロジェクトをアーカイブ' }).count(), 0);
  await page.goto(`${base}/projects/${mainProject.id}/settings`);
  await page.getByText(/このプロジェクトはPrivateです/).waitFor();
  await screenshot('12-project-settings', { fullPage: true });

  console.log('Projects: the add-member search keeps Enter in the dialog and moves the focus');
  const memberSaves = [];
  const recordMemberSave = (request) => {
    if (request.method() !== 'GET' && new URL(request.url()).pathname.includes('/members'))
      memberSaves.push(request.url());
  };
  page.on('request', recordMemberSave);
  await page.getByRole('button', { name: 'メンバーを追加', exact: true }).click();
  const memberDialog = page.getByRole('dialog', { name: 'メンバーを追加' });
  const userSearch = memberDialog.getByRole('searchbox');
  await userSearch.fill('研究員');
  await memberDialog.getByRole('button', { name: /上田 研究員/ }).waitFor();
  await userSearch.press('Enter');
  await memberDialog.getByRole('button', { name: /上田 研究員/ }).waitFor();
  assert.equal(await memberDialog.getByText('追加するユーザーを選択してください').count(), 0);
  await userSearch.fill('石井');
  await memberDialog.getByRole('button', { name: /石井 研究員/ }).waitFor();
  await userSearch.press('Enter');
  const changeUser = memberDialog.getByRole('button', { name: '選び直す', exact: true });
  await changeUser.waitFor();
  assert.equal(await isFocused(changeUser), true, 'the chosen user takes the focus');
  await page.keyboard.press('Enter');
  assert.equal(await isFocused(userSearch), true, 'choosing again focuses the search');
  assert.deepEqual(memberSaves, [], 'nothing is saved before 保存');
  page.off('request', recordMemberSave);
  await memberDialog.getByRole('button', { name: 'キャンセル', exact: true }).click();
  await memberDialog.waitFor({ state: 'detached' });
  await page.getByRole('button', { name: 'アーカイブ', exact: true }).click();
  // 確認のダイアログでは、残るデータに加えて、止まるものも示す。
  await dialog().getByText(/止まるもの: このプロジェクトに限定したAPI token/).waitFor();
  await dialog().getByRole('button', { name: 'アーカイブ', exact: true }).click();
  // ほかのProjectが勝手に開くことはなく、一覧で何が起きたかを伝える。
  await page.waitForURL(`${base}/`);
  await page.getByText(`「${mainProject.name}」をアーカイブしました`, { exact: false }).waitFor();
  await page.getByRole('heading', { name: '参加しているプロジェクト' }).waitFor();

  console.log('Projects: the filesystem root offers server directories as it is typed');
  await page.goto(`${base}/settings/storage`);
  await page.getByRole('button', { name: '保存先を追加', exact: true }).click();
  await dialog().getByLabel('種類').selectOption('filesystem');
  const rootPath = dialog().getByRole('combobox', { name: /ルートディレクトリ/ });
  await rootPath.fill('/srv/mmt/');
  const candidates = dialog().getByRole('listbox');
  await candidates.getByRole('option', { name: '/srv/mmt/artifacts' }).waitFor();
  assert.deepEqual(await candidates.getByRole('option').allInnerTexts(), [
    '/srv/mmt/archive',
    '/srv/mmt/artifacts',
  ]);
  await screenshot('08-root-directory-candidates');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  assert.equal(await rootPath.inputValue(), '/srv/mmt/artifacts');
  await dialog().waitFor();
  await rootPath.fill('/srv/m');
  await candidates.getByRole('option', { name: '/srv/models' }).waitFor();
  await page.keyboard.press('Escape');
  await candidates.waitFor({ state: 'hidden' });
  assert.equal(await dialog().count(), 1, 'Esc hides the candidates without closing the dialog');
  await candidates.getByRole('option').first().waitFor({ state: 'detached' });
  await rootPath.fill('/srv/mmt/new-artifacts');
  await dialog().getByText('/srv/mmt/new-artifacts はサーバにまだありません').waitFor();
  await screenshot('09-root-directory-missing-note');
  await rootPath.fill('/srv/mmt/README.md');
  await dialog().getByText('/srv/mmt/README.md はディレクトリではありません').waitFor();
  await rootPath.fill('arch');
  await candidates.getByRole('option', { name: '/srv/mmt/archive' }).click();
  assert.equal(await rootPath.inputValue(), '/srv/mmt/archive');
  await dialog().getByRole('button', { name: 'キャンセル', exact: true }).click();

  console.log('Projects: the narrow project bar opens the switcher inside the window');
  await page.setViewportSize(NARROW);
  await page.goto(`${base}/projects/${tts.id}/experiments`);
  await page.locator('.projectbar').waitFor();
  await openProjectSwitcher(page);
  const narrowBox = await page.locator('.project-switcher-popover').boundingBox();
  assert.ok(narrowBox.x >= 0 && narrowBox.x + narrowBox.width <= NARROW.width);
  assert.ok(narrowBox.y + narrowBox.height <= NARROW.height);
  assert.equal(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    true,
    'the narrow screen does not scroll sideways',
  );
  await screenshot('10-switcher-projectbar-narrow');
  await page.keyboard.press('Escape');
  await page.goto(`${base}/settings/projects`);
  await page.getByRole('row', { name: /TTS 本番/ }).waitFor();
  assert.equal(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    true,
    'the admin Project list fits the narrow screen',
  );
  await screenshot('11-admin-projects-narrow', { fullPage: true });

  assert.deepEqual(pageErrors, []);
  console.log(JSON.stringify({ ok: true, screenshotDirectory }));
} finally {
  await browser.close();
}
