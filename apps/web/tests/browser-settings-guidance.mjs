// Browser check of the guidance on the settings screens (fix plan 2026-10-11, 3段目 settings),
// against the isolated mock API (tests/browserApi.mjs): notification rules without a channel and
// the channel's variable names, a Mado connection whose credential storage is unavailable,
// the Project settings, the way back from 全体設定 and the bell there, a link to a 全体管理
// screen for someone else, and an archived Project's URL.
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
const WIDE = { width: 1440, height: 900 };
const NARROW = { width: 390, height: 844 };
const ARCHIVED_PROJECT_ID = '00000000-0000-4000-8000-00000000d001';

/** The shared mock API with two open alerts and an archived Project of the signed-in user. */
function createGuidanceApi() {
  const api = createBrowserApi();
  api.state.loggedIn = true;
  const { project } = api.state;
  const alert = (id, workerId) => ({
    id,
    projectId: project.id,
    kind: 'worker.offline',
    subjectId: `token:${workerId}`,
    openedAt: '2026-10-11T05:00:00Z',
    resolvedAt: null,
    resolution: null,
    detail: { workerId, hostname: 'gpu-node-01.example.invalid' },
  });
  const alerts = [
    alert('00000000-0000-4000-8000-00000000e001', 'gpu-a'),
    alert('00000000-0000-4000-8000-00000000e002', 'gpu-b'),
  ];
  async function route(route) {
    const path = new URL(route.request().url()).pathname.replace(/^\/api/, '');
    const reply = (payload, status = 200) =>
      route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(payload) });
    if (path === '/operations-alerts') return reply({ items: alerts });
    if (path === `/projects/${ARCHIVED_PROJECT_ID}`)
      return reply(
        {
          error:
            'このProjectはアーカイブされています。全体管理者が全体管理の「プロジェクト」から元に戻せます',
          code: 'project_archived',
        },
        404,
      );
    return api.route(route);
  }
  return { api, route };
}

const browser = await chromium.launch({
  headless: true,
  args: ['--no-sandbox'],
  ...(process.env.MMT_CHROMIUM_PATH ? { executablePath: process.env.MMT_CHROMIUM_PATH } : {}),
});
const pageErrors = [];
async function openPage({ guidance, viewport = WIDE }) {
  const context = await browser.newContext({ viewport, locale: 'ja-JP' });
  await context.route((url) => url.pathname.startsWith('/api/'), guidance.route);
  const page = await context.newPage();
  page.on('pageerror', (error) => pageErrors.push(error.message));
  const screenshot = async (name, options = {}) => {
    if (screenshotDirectory)
      await page.screenshot({ path: `${screenshotDirectory}/${name}.png`, ...options });
  };
  return { context, page, screenshot };
}

try {
  {
    console.log('Settings: contents, notification rules need a channel, channel variable names');
    const guidance = createGuidanceApi();
    const { context, page, screenshot } = await openPage({ guidance });
    const projectId = guidance.api.state.project.id;
    await page.goto(`${base}/projects/${projectId}/settings`);
    const contents = page.getByRole('navigation', { name: 'プロジェクト設定の目次' });
    await contents.waitFor();
    assert.deepEqual(await contents.getByRole('link').allTextContents(), [
      'プロジェクト',
      'Artifactの使用量',
      'SDK・MLflow 3から接続',
      'Members',
      'Authentik group',
      'Service Accounts',
      '自分のAPI token',
      '通知',
      '監査ログ',
      'プロジェクトをアーカイブ',
    ]);
    await contents.getByRole('link', { name: '通知', exact: true }).click();
    await page.waitForURL(/#settings-notifications$/);
    const createRule = page.getByRole('button', { name: '通知ルールを作成', exact: true });
    await createRule.waitFor();
    assert.equal(await createRule.isDisabled(), true, 'A rule cannot be made without a channel');
    // The mock user is a global administrator, who is pointed at the button above.
    await page.getByText('先に上の［通知先を追加］で通知先を作成してください。').waitFor();
    await screenshot('01-notifications-without-channel');

    await page.getByRole('button', { name: '通知先を追加', exact: true }).click();
    const channelDialog = page.getByRole('dialog', { name: '通知先を追加' });
    const urlEnv = channelDialog.getByRole('combobox', { name: /URLを参照する環境変数名/ });
    await urlEnv.click();
    await channelDialog.getByRole('option', { name: 'MMT_NOTIFICATION_SLACK_URL' }).click();
    assert.equal(await urlEnv.inputValue(), 'MMT_NOTIFICATION_SLACK_URL');
    assert.equal(await channelDialog.getByText(/がありません。このままでも保存できます/).count(), 0);
    await urlEnv.fill('MMT_NOTIFICATION_TYPO_URL');
    await channelDialog
      .getByText('API serverに MMT_NOTIFICATION_TYPO_URL がありません', { exact: false })
      .waitFor();
    await screenshot('02-channel-variable-missing');
    await channelDialog.getByRole('button', { name: 'キャンセル', exact: true }).click();
    await context.close();
  }

  {
    console.log('Mado: missing credential storage is explained and stops connection calls');
    const guidance = createGuidanceApi();
    const [plugin] = guidance.api.state.plugins;
    plugin.tokenConfigured = false;
    plugin.secretStorageAvailable = false;
    const { context, page, screenshot } = await openPage({ guidance });
    await page.goto(`${base}/projects/${guidance.api.state.project.id}/plugins`);
    await page
      .getByText('APIサーバーにMMT_PLUGIN_SECRET_KEYの設定が必要です', { exact: false })
      .waitFor();
    assert.equal(await page.getByRole('button', { name: '接続を確認', exact: true }).isDisabled(), true);
    assert.equal(await page.getByLabel('データセットを検索', { exact: true }).count(), 0);
    await screenshot('03-mado-secret-storage-missing');
    // Restoring credential storage enables a fresh explicit check before search.
    plugin.tokenConfigured = true;
    plugin.secretStorageAvailable = true;
    plugin.configRevision++;
    await page.getByRole('button', { name: '再読み込み', exact: true }).click();
    const check = page.getByRole('button', { name: '接続を確認', exact: true });
    await page.waitForFunction(
      () => Array.from(document.querySelectorAll('button')).some(
        (button) => button.textContent.trim() === '接続を確認' && !button.disabled,
      ),
    );
    assert.equal(await page.getByLabel('データセットを検索', { exact: true }).isDisabled(), true);
    await page.getByText('［接続を確認］が成功すると、データセットを検索できます。').waitFor();
    await check.click();
    await page.getByRole('status').getByText('接続を確認しました').waitFor();
    assert.equal(await page.getByLabel('データセットを検索', { exact: true }).isDisabled(), false);
    await context.close();
  }

  {
    console.log('全体設定: the bell counts every Project, and leads back to the Jobs it came from');
    const guidance = createGuidanceApi();
    const projectId = guidance.api.state.project.id;
    const { context, page, screenshot } = await openPage({ guidance });
    await page.goto(`${base}/projects/${projectId}/jobs`);
    await page.getByRole('heading', { name: 'Jobs', exact: true }).waitFor();
    await page.getByRole('button', { name: 'ユーザーメニュー' }).click();
    await page.getByRole('menuitem', { name: '全体設定', exact: true }).click();
    await page.waitForURL(`${base}/settings/account`);
    // The Project screen stays until the account page has loaded; its bell is not the one to open.
    await page.getByRole('heading', { name: 'アカウント', exact: true, level: 1 }).waitFor();
    const bell = page.getByRole('button', { name: '運用アラート 2件' });
    await bell.click();
    const popover = page.getByRole('dialog', { name: '運用アラート 2件' });
    // The Project names are read when the list opens.
    await popover.getByText(guidance.api.state.project.name).first().waitFor();
    await screenshot('04-settings-bell-and-way-back');
    await page.keyboard.press('Escape');
    await page.getByRole('link', { name: `「${guidance.api.state.project.name}」に戻る` }).click();
    await page.waitForURL(`${base}/projects/${projectId}/jobs`);
    await context.close();
  }

  {
    console.log('全体管理: a link to it for someone else explains the account shown instead');
    const guidance = createGuidanceApi();
    guidance.api.state.user.isAdmin = false;
    const { context, page, screenshot } = await openPage({ guidance, viewport: NARROW });
    await page.goto(`${base}/settings/users`);
    await page.waitForURL(`${base}/settings/account`);
    await page.getByText('開こうとした画面は全体管理者だけが使えます', { exact: false }).waitFor();
    await screenshot('05-admin-only-redirect-mobile');
    await context.close();
  }

  {
    console.log('Archive: an archived Project\'s URL says so instead of "missing or not shared"');
    const guidance = createGuidanceApi();
    const { context, page, screenshot } = await openPage({ guidance });
    await page.goto(`${base}/projects/${ARCHIVED_PROJECT_ID}/experiments`);
    await page.getByText('このプロジェクトはアーカイブされています', { exact: false }).waitFor();
    assert.equal(await page.getByText('存在しないか、参加していないため開けません').count(), 0);
    await screenshot('06-archived-project-url');
    await context.close();
  }

  assert.deepEqual(pageErrors, []);
  console.log('Settings guidance browser checks passed.');
} finally {
  await browser.close();
}
