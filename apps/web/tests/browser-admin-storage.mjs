// 全体管理 → ストレージ（/settings/storage）のブラウザでの確認。保存先を作る（作るとすぐ接続を
// テストする）、接続テストを行う、既定を変える（テストが失敗している間は断られる）、Projectの
// フォームで保存先を選ぶ。保存先のAPIは、このファイルの中のモックで答える。
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { createBrowserApi } from './browserApi.mjs';
import { openProjectSwitcher } from './projectSwitcher.mjs';

const modulePath = process.env.MMT_PLAYWRIGHT_MODULE;
if (!modulePath) throw new Error('Set MMT_PLAYWRIGHT_MODULE to an installed Playwright index.mjs');
const webUrl = process.env.MMT_WEB_URL ?? 'http://127.0.0.1:5182';
const outputDirectory = process.env.MMT_VERIFY_OUTPUT ?? 'artifacts/verification/2026-10-08/storage-web';
const { chromium } = await import(pathToFileURL(modulePath).href);
await mkdir(outputDirectory, { recursive: true });

const SECRET_VALUE = 'browser-test-secret-value';
const MIB = 1024 * 1024;
const api = createBrowserApi();
api.state.loggedIn = true;
const storage = {
  defaultBackend: 'filesystem',
  backends: [
    {
      name: 'filesystem',
      kind: 'filesystem',
      source: 'environment',
      rootPath: '/var/lib/mmt/artifacts',
      signatureVersion: 'v4',
      tlsVerify: true,
      caBundleConfigured: false,
      checksumMode: 'when_required',
      multipartPartSizeBytes: 16 * MIB,
      multipartEnabled: true,
      secretConfigured: false,
      enabled: true,
    },
  ],
  requests: [],
  // モックのbucketは、access keyが「直る」までは削除を断る。
  deleteAllowed: false,
  tests: 0,
};

function toBackend(body) {
  const { secretAccessKey, caBundle, ...settings } = body;
  return {
    signatureVersion: 'v4',
    tlsVerify: true,
    checksumMode: 'when_required',
    multipartPartSizeBytes: 16 * MIB,
    multipartEnabled: true,
    enabled: true,
    ...settings,
    source: 'database',
    caBundleConfigured: Boolean(caBundle),
    secretConfigured: Boolean(secretAccessKey),
  };
}

async function routeStorage(route) {
  const request = route.request();
  const path = new URL(request.url()).pathname.replace(/^\/api/, '');
  const method = request.method();
  const reply = (payload, status = 200) =>
    route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(payload) });
  const body = request.postData() ? request.postDataJSON() : {};
  if (path === '/storage/backends')
    return reply({
      items: storage.backends.filter((backend) => backend.enabled).map((backend) => backend.name),
      defaultBackend: storage.defaultBackend,
    });
  if (path === '/admin/storage-settings') {
    if (method === 'PUT') storage.defaultBackend = body.defaultBackend;
    return reply({ defaultBackend: storage.defaultBackend });
  }
  if (path === '/admin/storage-backends') {
    if (method === 'GET') return reply({ items: storage.backends });
    storage.requests.push(body);
    const backend = toBackend(body);
    storage.backends.push(backend);
    return reply(backend);
  }
  const testMatch = path.match(/^\/admin\/storage-backends\/([^/]+)\/test$/);
  if (testMatch) {
    storage.tests++;
    return reply({
      steps: [
        { name: 'put', ok: true },
        { name: 'get', ok: true },
        { name: 'range', ok: true },
        storage.deleteAllowed
          ? { name: 'delete', ok: true }
          : { name: 'delete', ok: false, error: 'AccessDenied: s3:DeleteObject is not allowed' },
      ],
    });
  }
  return api.route(route);
}

const browser = await chromium.launch({
  headless: true,
  args: ['--no-sandbox'],
  ...(process.env.MMT_CHROMIUM_PATH ? { executablePath: process.env.MMT_CHROMIUM_PATH } : {}),
});
const pageErrors = [];
try {
  const context = await browser.newContext({ locale: 'ja-JP', viewport: { width: 1440, height: 900 } });
  await context.route((url) => url.pathname.startsWith('/api/'), routeStorage);
  const page = await context.newPage();
  page.on('pageerror', (error) => pageErrors.push(error.message));

  await page.goto(`${webUrl}/projects/${api.state.project.id}/experiments`);
  // Projectのサイドバーには、そのProject自身の画面だけがある。全体設定はユーザーメニューから開き、
  // そのサイドバーは全体管理の各画面を「全体管理」の下に並べる。
  await page.getByRole('button', { name: 'ユーザーメニュー', exact: true }).click();
  await page.getByRole('menuitem', { name: '全体設定', exact: true }).click();
  await page.waitForURL(/\/settings\/account$/);
  await page
    .getByRole('group', { name: '全体管理', exact: true })
    .getByRole('link', { name: 'ストレージ', exact: true })
    .click();
  await page.waitForURL(/\/settings\/storage$/);
  await page.getByRole('heading', { name: 'ストレージ', exact: true }).waitFor();
  await page.getByRole('cell', { name: '/var/lib/mmt/artifacts' }).waitFor();
  await page.screenshot({ path: `${outputDirectory}/01-admin-storage.png`, fullPage: true });

  // 署名がv2のS3の保存先を作る。
  await page.getByRole('button', { name: '保存先を追加' }).click();
  const dialog = page.getByRole('dialog', { name: '保存先を追加' });
  await dialog.getByLabel('名前').fill('minio-main');
  await dialog.getByLabel('Endpoint URL（AWSなら空欄）').fill('https://minio.example.internal:9000');
  await dialog.getByLabel('Bucket').fill('mmt-artifacts');
  await dialog.getByLabel('Prefix（任意）').fill('/team-a/');
  await dialog.getByLabel('path-styleでアクセスする').check();
  await dialog.getByLabel('Access key ID（任意）').fill('AKIAEXAMPLE');
  await dialog.getByLabel('Secret access key').fill(SECRET_VALUE);
  assert.equal(await dialog.getByLabel('Secret access key').getAttribute('type'), 'password');
  // 署名、TLS、checksum、multipartは詳細設定の中に畳んである。
  assert.equal(await dialog.getByLabel('署名').isVisible(), false);
  await dialog.getByText('詳細設定（署名・TLS・Checksum・Multipart）').click();
  await dialog.getByLabel('署名').selectOption('v2');
  await dialog.getByRole('button', { name: '作成' }).click();
  await dialog.waitFor({ state: 'detached' });
  // 保存するとすぐ新しい保存先をテストし、失敗したら設定の変更へ進める。
  await page.getByText('接続テストの結果: minio-main').waitFor();
  assert.equal(storage.tests, 1);
  await page.getByRole('button', { name: '設定を変更', exact: true }).waitFor();
  const created = storage.requests.at(-1);
  assert.equal(created.prefix, 'team-a');
  assert.equal(created.signatureVersion, 'v2');
  assert.equal(created.rootPath, undefined, 'S3 backends do not send the filesystem root');
  assert.ok(!(await page.content()).includes(SECRET_VALUE), 'the secret is never rendered');

  // 変更のダイアログでは、保存済みのsecretは設定してあることだけを示す。
  const s3Row = page.getByRole('row', { name: /minio-main/ });
  await s3Row.getByRole('button', { name: '変更' }).click();
  const editDialog = page.getByRole('dialog', { name: '保存先を変更' });
  assert.equal(await editDialog.getByLabel('Secret access key').inputValue(), '');
  assert.match(
    (await editDialog.getByLabel('Secret access key').getAttribute('placeholder')) ?? '',
    /設定済み/,
  );
  await page.screenshot({ path: `${outputDirectory}/03-edit-secret-configured.png` });
  await editDialog.getByRole('button', { name: 'キャンセル' }).click();

  await s3Row.getByRole('button', { name: '接続テスト' }).click();
  await page.getByText('AccessDenied: s3:DeleteObject is not allowed').waitFor();
  await page.screenshot({ path: `${outputDirectory}/04-connection-test.png`, fullPage: true });

  // テストに失敗する保存先は既定にならない。
  await s3Row.getByRole('button', { name: '既定にする' }).click();
  const confirm = page.getByRole('dialog', { name: '既定の保存先を変更' });
  await confirm.getByText('既存のArtifactは移動しません', { exact: false }).waitFor();
  await confirm.getByText('既定にする前に接続テストを行い', { exact: false }).waitFor();
  await page.screenshot({ path: `${outputDirectory}/05-default-confirm.png` });
  await confirm.getByRole('button', { name: '既定にする' }).click();
  await confirm.getByText('接続テストに失敗したため、既定の保存先にしませんでした', { exact: false }).waitFor();
  assert.equal(storage.defaultBackend, 'filesystem');
  await confirm.getByRole('button', { name: 'キャンセル' }).click();
  await confirm.waitFor({ state: 'detached' });
  // bucketが削除を受け付けるようになると、改めて行うテストが通り、既定が変わる。
  storage.deleteAllowed = true;
  await s3Row.getByRole('button', { name: '既定にする' }).click();
  await confirm.getByRole('button', { name: '既定にする' }).click();
  await confirm.waitFor({ state: 'detached' });
  await s3Row.getByText('既定の保存先').waitFor();
  assert.equal(storage.defaultBackend, 'minio-main');
  await page.screenshot({ path: `${outputDirectory}/06-default-changed.png`, fullPage: true });

  // 新しいProjectは新しい既定の保存先から始まる。設定の一覧は名前と種類を並べて出す。
  await page.goto(`${webUrl}/projects/${api.state.project.id}/settings`);
  await page.getByRole('radio', { name: /filesystem/ }).first().waitFor();
  assert.ok(await page.getByRole('radio', { name: /^filesystem/ }).isChecked());
  // Projectはスイッチャーから作る。設定の画面はもうProjectの一覧も作成も持たない。
  assert.equal(await page.getByRole('button', { name: 'プロジェクトを作成' }).count(), 0);
  const switcher = await openProjectSwitcher(page);
  await switcher.getByRole('option', { name: 'プロジェクトを作成', exact: true }).click();
  const projectDialog = page.getByRole('dialog', { name: 'プロジェクトを作成' });
  // 既定の保存先を明示し、ほかの保存先は「ほかの保存先を選ぶ」の奥に置く。
  await projectDialog.getByText('既定の保存先「minio-main」に保存します', { exact: false }).waitFor();
  await projectDialog.getByText('ほかの保存先を選ぶ', { exact: true }).click();
  assert.ok(await projectDialog.getByRole('radio', { name: /minio-main/ }).isChecked());
  await page.screenshot({ path: `${outputDirectory}/07-new-project-default.png` });
  await projectDialog.getByRole('button', { name: 'キャンセル' }).click();

  // 全体管理者でない人には全体管理のリンクが出ず、ストレージの画面は全体設定の本人のアカウントへ
  // 送る。ユーザーメニューには全体設定が引き続き出る。
  api.state.user.isAdmin = false;
  await page.goto(`${webUrl}/settings/storage`);
  await page.waitForURL(/\/settings\/account$/);
  assert.equal(await page.getByRole('link', { name: 'ストレージ', exact: true }).count(), 0);
  await page.getByRole('button', { name: 'ユーザーメニュー', exact: true }).click();
  assert.equal(await page.getByRole('menuitem', { name: '全体管理', exact: true }).count(), 0);
  await page.getByRole('menuitem', { name: '全体設定', exact: true }).waitFor();
  await page.screenshot({ path: `${outputDirectory}/08-non-admin.png` });

  assert.deepEqual(pageErrors, []);
  console.log(JSON.stringify({ ok: true, outputDirectory }));
} finally {
  await browser.close();
}
