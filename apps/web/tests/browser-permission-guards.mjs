// だれが何をできるかを変えてしまう誤操作を防ぐ仕組みのブラウザでの確認（2026-10-11の修正計画、
// 誤操作・権限）。分離したモックのAPI（tests/browserApi.mjs）を相手にする。既にメンバーの人の追加、
// 最後のProject adminとだれもログインしていないgroup、公開範囲や保存先の変更の確認、「/」で開く
// Project、Jobの停止と再試行、Editorから見た保護alias、データセットのバージョンのdigestの手がかりと削除。
// 先にMMT_WEB_URLでViteを起動しておく。MMT_SCREENSHOT_DIRを設定すると、そこにスクリーンショットを保存する。
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
const WIDE = { width: 1440, height: 900 };
const NARROW = { width: 390, height: 844 };
const now = '2026-10-11T00:00:00Z';
// 名前を打ち間違えて割り当てたgroup。このgroupでログインした人はいない。
const EMPTY_ADMIN_GROUP = 'ml-admins-typo';
const COLLEAGUE = { id: '00000000-0000-4000-8000-00000000c001', displayName: '研究者B' };
const DATASET_VERSION_IN_USE =
  'このバージョンは使われているため削除できません（Runの入力 1件）';

/**
 * 共通のモックのAPIに、これらの画面に要るものを足したもの。メンバーの一覧とだれもいない管理者の
 * group、aliasの保護、ログイン中のユーザーと同僚が起動したJob。
 */
function createGuardApi() {
  const api = createBrowserApi();
  api.state.loggedIn = true;
  const { state } = api;
  const { user, project } = state;
  const [finishedRun, , runningRun] = state.runs;
  const colleagueRun = {
    ...state.runs[1],
    id: '00000000-0000-4000-8000-00000000c101',
    name: 'colleague-training',
    createdBy: COLLEAGUE.id,
    createdByName: COLLEAGUE.displayName,
    status: 'running',
  };
  state.runs.push(colleagueRun);
  const job = (fields) => ({
    projectId: project.id,
    targetId: state.targets[0].id,
    gpuIds: ['0'],
    workerId: null,
    leaseId: null,
    cancelRequested: false,
    attempt: 1,
    maxAttempts: 3,
    createdAt: now,
    startedAt: now,
    endedAt: null,
    heartbeatAt: now,
    exitCode: null,
    error: null,
    heartbeatStale: false,
    phase: null,
    gpuCount: 1,
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
  state.jobs.push(
    job({ id: '00000000-0000-4000-8000-00000000d001', runId: runningRun.id, status: 'running' }),
    job({ id: '00000000-0000-4000-8000-00000000d002', runId: finishedRun.id, status: 'failed', endedAt: now }),
    job({ id: '00000000-0000-4000-8000-00000000d003', runId: colleagueRun.id, status: 'running' }),
  );
  state.models[0].aliases = {
    production: state.modelVersions[0].id,
    staging: state.modelVersions[0].id,
  };
  const memberSaves = [];
  const members = () => [
    { user, role: 'admin', directRole: 'admin', groups: [] },
    {
      user: { ...user, ...COLLEAGUE, email: 'b@example.invalid', isAdmin: false, username: null },
      role: 'editor',
      directRole: 'editor',
      groups: [],
    },
  ];
  async function route(route) {
    const request = route.request();
    const path = new URL(request.url()).pathname.replace(/^\/api/, '');
    const method = request.method();
    const reply = (payload, status = 200) =>
      route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(payload) });
    const projectPath = `/projects/${project.id}`;
    if (path === `${projectPath}/members` && method === 'GET') return reply({ items: members() });
    if (path.startsWith(`${projectPath}/members/`) && method === 'PUT') {
      memberSaves.push({ userId: path.split('/').pop(), ...request.postDataJSON() });
      return reply(members()[0]);
    }
    if (path === `${projectPath}/group-bindings` && method === 'GET')
      return reply({
        items: [
          { projectId: project.id, group: EMPTY_ADMIN_GROUP, role: 'admin', createdBy: user.id, createdAt: now },
        ],
      });
    if (path === `${projectPath}/alias-protections` && method === 'GET')
      return reply({
        items: [
          {
            id: 'protection-production',
            projectId: project.id,
            modelId: null,
            alias: 'production',
            requiredRole: 'admin',
            requirePassedEvaluation: false,
            createdBy: user.id,
            createdAt: now,
            updatedBy: user.id,
            updatedAt: now,
          },
        ],
      });
    const versionMatch = path.match(/^\/projects\/[^/]+\/datasets\/[^/]+\/versions\/([^/]+)$/);
    if (versionMatch && method === 'DELETE') {
      if (versionMatch[1] === state.datasetVersions[0].id)
        return reply({ error: DATASET_VERSION_IN_USE, code: 'dataset_version_in_use' }, 409);
      state.datasetVersions = state.datasetVersions.filter((version) => version.id !== versionMatch[1]);
      return route.fulfill({ status: 204, body: '' });
    }
    return api.route(route);
  }
  return { api, route, memberSaves };
}

const browser = await chromium.launch({
  headless: true,
  args: ['--no-sandbox'],
  ...(process.env.MMT_CHROMIUM_PATH ? { executablePath: process.env.MMT_CHROMIUM_PATH } : {}),
});
const pageErrors = [];
async function openPage({ guard, viewport = WIDE }) {
  const context = await browser.newContext({ viewport, locale: 'ja-JP' });
  await context.route((url) => url.pathname.startsWith('/api/'), guard.route);
  const page = await context.newPage();
  page.on('pageerror', (error) => pageErrors.push(error.message));
  const screenshot = async (name, options = {}) => {
    if (screenshotDirectory)
      await page.screenshot({ path: `${screenshotDirectory}/${name}.png`, ...options });
  };
  return { context, page, screenshot };
}
const patchedProjects = (api) =>
  api.state.calls.filter((call) => call.method === 'PATCH' && /^\/projects\/[^/]+$/.test(call.path));

try {
  {
    console.log('Members: someone who is already a member cannot be added again; Editor is the default');
    const guard = createGuardApi();
    const { api } = guard;
    const { context, page, screenshot } = await openPage({ guard });
    const projectId = api.state.project.id;
    await page.goto(`${base}/projects/${projectId}/settings`);
    const settingsSection = (heading) =>
      page.locator('section.settings-section', {
        has: page.getByRole('heading', { name: heading, exact: true }),
      });
    const membersSection = settingsSection('Members');
    await membersSection.getByText('最後のAdminなので変更・削除できません。', { exact: false }).waitFor();
    const selfRow = membersSection.getByRole('row', { name: /UI検証担当/ });
    assert.equal(await selfRow.getByRole('button', { name: '変更', exact: true }).isDisabled(), true);
    assert.equal(await selfRow.getByRole('button', { name: '外す', exact: true }).isDisabled(), true);
    const colleagueRow = membersSection.getByRole('row', { name: /研究者B/ });
    assert.equal(await colleagueRow.getByRole('button', { name: '外す', exact: true }).isDisabled(), false);
    const groupsSection = settingsSection('Authentik group');
    await groupsSection.getByText('まだ誰もログインしていません', { exact: true }).waitFor();
    await membersSection.scrollIntoViewIfNeeded();
    await screenshot('01-members-last-admin-and-empty-group', { fullPage: true });

    await membersSection.getByRole('button', { name: 'メンバーを追加', exact: true }).click();
    const memberDialog = page.getByRole('dialog', { name: 'メンバーを追加' });
    assert.equal(await memberDialog.getByRole('combobox', { name: '直接付与のRole' }).inputValue(), 'editor');
    const search = memberDialog.getByRole('searchbox');
    await search.fill('UI');
    const existing = memberDialog.getByRole('button', { name: /UI検証担当/ });
    await existing.waitFor();
    assert.equal(await existing.isDisabled(), true);
    await memberDialog.getByText('既にAdminです。Roleは一覧の［変更］で変えます').waitFor();
    // Enterは選べるユーザーだけを選ぶので、既にいるメンバーは選ばれない。
    await search.press('Enter');
    assert.equal(await memberDialog.getByRole('button', { name: '選び直す', exact: true }).count(), 0);
    await screenshot('02-member-add-existing-member');
    await search.fill('石井');
    await memberDialog.getByRole('button', { name: /石井 研究員/ }).click();
    await memberDialog.getByRole('button', { name: '保存', exact: true }).click();
    await memberDialog.waitFor({ state: 'detached' });
    assert.deepEqual(guard.memberSaves, [
      { userId: '00000000-0000-4000-8000-00000000a002', role: 'editor' },
    ]);

    console.log('Settings: a change of visibility or storage is confirmed before saving');
    const settings = page.locator('section.project-settings');
    await settings.getByText('既存のArtifactは今の保存先に残ります', { exact: false }).waitFor();
    await settings.getByRole('radio', { name: /^Public/ }).check();
    await settings.getByRole('button', { name: '保存', exact: true }).click();
    const confirm = page.getByRole('dialog', { name: 'プロジェクト設定の変更を確認' });
    await confirm.getByText(/ログインできる全員がEditorとして見られて、編集できるようになります/).waitFor();
    await screenshot('03-visibility-change-confirm');
    await confirm.getByRole('button', { name: 'キャンセル', exact: true }).click();
    await confirm.waitFor({ state: 'detached' });
    assert.equal(patchedProjects(api).length, 0, 'nothing is saved before the confirmation');
    await settings.getByRole('radio', { name: /^s3/ }).check();
    await settings.getByRole('button', { name: '保存', exact: true }).click();
    await confirm.getByText(/Artifactの保存先を「filesystem」から「s3」に変えます/).waitFor();
    await screenshot('04-visibility-and-storage-confirm');
    await confirm.getByRole('button', { name: '変更を保存', exact: true }).click();
    await confirm.waitFor({ state: 'detached' });
    await page.getByRole('status').getByText('プロジェクト設定を保存しました').waitFor();
    assert.deepEqual(patchedProjects(api).map((call) => call.body), [
      { description: 'ブラウザテストのAPIデータ', artifactBackend: 's3', visibility: 'public' },
    ]);
    await context.close();
  }

  {
    console.log('Home: "/" never enters a Project the user is not a member of');
    const guard = createGuardApi();
    const { project } = guard.api.state;
    // ほかの人のPublicのProject。このユーザーに見えるのはこれだけ。
    Object.assign(project, { isMember: false, visibility: 'public', role: 'editor' });
    const { context, page, screenshot } = await openPage({ guard });
    await page.goto(`${base}/`);
    await page.getByRole('heading', { name: 'メンバーでなくても入れるプロジェクト（Public）' }).waitFor();
    assert.equal(new URL(page.url()).pathname, '/');
    await page.getByRole('heading', { name: '参加しているプロジェクト' }).waitFor();
    await page.getByText('参加しているプロジェクトがありません').waitFor();
    await screenshot('05-home-project-list');
    await page.getByRole('link', { name: project.name, exact: true }).click();
    await page.waitForURL(`${base}/projects/${project.id}/experiments`);
    // 一度開くと、「/」でまたそのProjectが開く。開いた画面が描かれてそれを覚えるより前にURLが変わるので、
    // 再読み込みと競争せず、覚えたidを待つ。
    await page.waitForFunction(
      (projectId) => localStorage.getItem('mmt.lastProject') === projectId,
      project.id,
    );
    await page.goto(`${base}/`);
    await page.waitForURL(`${base}/projects/${project.id}/experiments`);
    await context.close();

    const narrow = await openPage({ guard, viewport: NARROW });
    await narrow.page.goto(`${base}/`);
    await narrow.page.getByRole('heading', { name: 'メンバーでなくても入れるプロジェクト（Public）' }).waitFor();
    assert.equal(
      await narrow.page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      true,
      'the list fits a phone',
    );
    await narrow.screenshot('06-home-project-list-mobile');
    await narrow.context.close();

    project.isMember = true;
    const member = await openPage({ guard });
    await member.page.goto(`${base}/`);
    await member.page.waitForURL(`${base}/projects/${project.id}/experiments`);
    await member.context.close();
  }

  {
    console.log('Jobs: only the one who started a Job (or a Project admin) stops or retries it');
    const guard = createGuardApi();
    const { api } = guard;
    api.state.project.role = 'editor';
    const { context, page, screenshot } = await openPage({ guard });
    await page.goto(`${base}/projects/${api.state.project.id}/jobs`);
    const table = page.locator('table').filter({ hasText: '作成者' });
    await table.waitFor();
    const colleagueRow = table.getByRole('row', { name: /colleague-training/ });
    await colleagueRow.getByText(COLLEAGUE.displayName).waitFor();
    assert.equal(await colleagueRow.getByRole('button', { name: '停止を要求' }).count(), 0);
    await screenshot('07-jobs-started-by');
    await table.getByRole('row', { name: /finetuning-test-03/ }).getByRole('button', { name: '停止を要求' }).click();
    const stop = page.getByRole('dialog', { name: 'Jobの停止' });
    await stop.getByText(/Run「finetuning-test-03」\s+作成者: UI検証担当\s+実行先: UI検証Compute/).waitFor();
    await stop.getByText(/実行中のプロセスへ停止を頼みます/).waitFor();
    assert.equal(await stop.getByRole('button', { name: '保存' }).count(), 0);
    await screenshot('08-job-stop-confirm');
    await stop.getByRole('button', { name: '停止する', exact: true }).click();
    await stop.waitFor({ state: 'detached' });
    const cancelPath = '/jobs/00000000-0000-4000-8000-00000000d001/cancel';
    assert.ok(
      api.state.calls.some((call) => call.method === 'POST' && call.path.endsWith(cancelPath)),
    );

    await table
      .getByRole('row', { name: /training-test-01/ })
      .getByRole('button', { name: '新しいRunで再実行' })
      .click();
    const retry = page.getByRole('dialog', { name: '新しいRunで再実行' });
    await retry.getByText(/元のRunとJobはそのまま残ります/).waitFor();
    await screenshot('09-job-retry-confirm');
    await retry.getByRole('button', { name: '再実行する', exact: true }).click();
    await page.waitForURL(/\/runs\/[^/]+$/);
    await context.close();
  }

  {
    console.log('Models: an editor sees which aliases are protected and is not offered their removal');
    const guard = createGuardApi();
    const { api } = guard;
    api.state.project.role = 'editor';
    const { context, page, screenshot } = await openPage({ guard });
    await page.goto(`${base}/projects/${api.state.project.id}/models?id=${api.state.models[0].id}`);
    const production = page.getByRole('row', { name: /production/ });
    await production.getByText('保護alias（adminのみ）').waitFor();
    await production.getByText('解除にはProject adminの権限が必要です').waitFor();
    assert.equal(await production.getByRole('button', { name: 'Aliasを解除' }).count(), 0);
    await page.getByRole('row', { name: /staging/ }).getByRole('button', { name: 'Aliasを解除' }).waitFor();
    await screenshot('10-models-protected-alias');
    await context.close();
  }

  {
    console.log('Datasets: the digest form is explained, and a version in use is not deleted');
    const guard = createGuardApi();
    const { api } = guard;
    const { context, page, screenshot } = await openPage({ guard });
    const dataset = api.state.datasets[0];
    const version = api.state.datasetVersions[0];
    await page.goto(`${base}/projects/${api.state.project.id}/datasets?id=${dataset.id}&version=${version.id}`);
    await page.getByRole('button', { name: 'バージョンを作成', exact: true }).click();
    const create = page.getByRole('dialog');
    await create.getByText(/「sha256:」と64桁の小文字の16進数で書きます/).waitFor();
    await screenshot('11-dataset-version-digest-hint');
    await create.getByRole('button', { name: 'キャンセル', exact: true }).click();
    await page.getByRole('button', { name: 'このバージョンを削除', exact: true }).click();
    const remove = page.getByRole('dialog', { name: 'データセットのバージョンを削除' });
    await remove.getByRole('button', { name: '削除する', exact: true }).click();
    await remove.getByText(DATASET_VERSION_IN_USE).waitFor();
    await screenshot('12-dataset-version-in-use');
    await context.close();
  }
  assert.deepEqual(pageErrors, []);
  console.log('Permission guards: all checks passed');
} finally {
  await browser.close();
}
