// capture-accounts.mjsのスクリーンショットに映るユーザー、Project、コンピュータを、accountsの環境
// （ローカルのログイン）に入れる。
//   node pages/scripts/screenshots/seed-accounts.mjs [--lang en]
// 全体管理者はserve-environment.mjsが生成したパスワードでログインし、最初のログインで求められる
// とおりにパスワードを変える。新しいパスワードは環境のディレクトリのmode 600のファイルに書き、
// 出力はしない。データを入れ済みの環境で再実行しても何もしない。途中で失敗したら、環境を消して
// （serve-environment.mjs drop accounts）やり直す。
import { randomBytes } from 'node:crypto';
import { access, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { REPOSITORY_ROOT, environmentDirectory, parseArguments, readEnvironment } from './screenshotEnvironment.mjs';

// 16バイトの乱数を16進数で表す。APIのパスワードの長さの制限に収まる。
const PASSWORD_BYTES = 16;
const JOB_SHELL_EXAMPLE = path.join(REPOSITORY_ROOT, 'deploy/sites/examples/direct-docker/job.sh');
const ABCI_KNOWN_HOSTS = 'login.abci.example.invalid ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIExampleHostKeyForDocs';

const PEOPLE = {
  ja: { aoki: '青木 研究員', ishii: '石井 研究員', ueda: '上田 研究員' },
  en: { aoki: 'Ken Aoki', ishii: 'Mei Ishii', ueda: 'Yui Ueda' },
};
// 作る順に並べる。一覧は新しいものを先に出す。
const PROJECTS = {
  ja: {
    oldBaseline: { name: '旧ベースライン', description: '2026年春の比較用。' },
    evaluationData: { name: '評価データ整備', description: '管理者だけで準備中。' },
    imageClassification: { name: '画像分類 実験', description: 'ViT と ConvNeXt の比較。' },
    ttsProduction: { name: 'TTS 本番', description: '本番に出す音声合成モデル。' },
    speechRecognition: { name: '音声認識 ASR', description: '日本語の音声認識モデルの学習と評価。' },
  },
  en: {
    oldBaseline: { name: 'Old baseline', description: 'For comparison with spring 2026.' },
    evaluationData: { name: 'Evaluation data', description: 'Being prepared by administrators only.' },
    imageClassification: { name: 'Image classification', description: 'Comparing ViT and ConvNeXt.' },
    ttsProduction: { name: 'TTS production', description: 'Speech synthesis models for production.' },
    speechRecognition: { name: 'Speech recognition ASR', description: 'Training and evaluating Japanese speech recognition models.' },
  },
};
const WORKER_ACCOUNT_DESCRIPTION = { ja: 'GPUサーバー1台目のworker', en: 'Worker on the first GPU server' };

const { options } = parseArguments(process.argv.slice(2));
const { lang } = options;
const directory = environmentDirectory(lang, 'accounts');
const { apiUrl, webUrl } = await readEnvironment(lang, 'accounts');
const stateFile = path.join(directory, 'seed-state.json');

async function exists(file) {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
}

async function call(method, resource, { body, cookie } = {}) {
  const response = await fetch(`${apiUrl}/api${resource}`, {
    method,
    headers: { origin: webUrl, ...(body ? { 'content-type': 'application/json' } : {}), ...(cookie ? { cookie } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  // ステータスとAPIのメッセージだけを出す。要求の本文にはパスワードが入っていることがある。
  if (!response.ok) throw new Error(`${method} ${resource}: ${response.status} ${text.slice(0, 300)}`);
  return { body: text ? JSON.parse(text) : null, cookie: response.headers.get('set-cookie')?.split(';')[0] };
}

async function signIn(username, password) {
  return (await call('POST', '/auth/local-login', { body: { username, password } })).cookie;
}

function newPassword() {
  return randomBytes(PASSWORD_BYTES).toString('hex');
}

async function writePassword(name, password) {
  await writeFile(path.join(directory, name), password, { mode: 0o600 });
}

/** 仮のパスワードでログインし、最初のログインで求められる新しいパスワードを設定して保存する。 */
async function signInChangingPassword(username, temporaryPassword) {
  const cookie = await signIn(username, temporaryPassword);
  const password = newPassword();
  await call('POST', '/auth/change-password', { cookie, body: { currentPassword: temporaryPassword, newPassword: password } });
  await writePassword(`${username}-password`, password);
  return signIn(username, password);
}

if (await exists(stateFile)) {
  console.log(`already seeded: ${stateFile}`);
  process.exit(0);
}

const initialPassword = (await readFile(path.join(directory, 'admin-initial-password'), 'utf8')).trim();
const admin = await signInChangingPassword('admin', initialPassword);

const userIds = {};
let aoki;
for (const [username, displayName] of Object.entries(PEOPLE[lang])) {
  const temporaryPassword = newPassword();
  const { body } = await call('POST', '/admin/users', {
    cookie: admin,
    body: { username, displayName, email: `${username}@example.invalid`, password: temporaryPassword, isAdmin: false },
  });
  userIds[username] = body.id;
  // 一般の利用者として撮るスクリーンショットのために、Aokiがログインする。
  if (username === 'aoki') aoki = await signInChangingPassword('aoki', temporaryPassword);
}

const projectIds = {};
const projectText = PROJECTS[lang];
async function createProject(key, settings) {
  const { body } = await call('POST', '/projects', { cookie: admin, body: { ...projectText[key], ...settings } });
  projectIds[key] = body.id;
}
await createProject('oldBaseline', { visibility: 'public' });
await createProject('evaluationData', { visibility: 'private' });
await createProject('imageClassification', { visibility: 'public' });
await createProject('ttsProduction', {
  visibility: 'private',
  members: [
    { userId: userIds.aoki, role: 'editor' },
    { userId: userIds.ishii, role: 'viewer' },
  ],
});
await createProject('speechRecognition', { visibility: 'public' });
await call('POST', `/projects/${projectIds.oldBaseline}/archive`, { cookie: admin });
// ドキュメントでtokenのダイアログを見せるService Account。
await call('POST', `/projects/${projectIds.speechRecognition}/service-accounts`, {
  cookie: admin,
  body: { name: 'gpu-host-1-worker', description: WORKER_ACCOUNT_DESCRIPTION[lang], role: 'admin' },
});

// コンピュータ。個人のアカウントで使うPublicのsite、全体管理者のPrivateとPublicのSSHサーバー、
// Aokiが手で投入するAokiのPrivateのPC。
const noConnection = { host: '', port: 22, username: '', sshKeyPath: '', knownHostsPath: '', workDirectory: '', pythonExecutable: '' };
const { body: createdLauncher } = await call('POST', '/launchers', { cookie: admin, body: { name: 'docs-launcher' } });
await call('POST', '/targets', {
  cookie: admin,
  body: {
    ...noConnection,
    name: 'ABCI',
    executor: 'site',
    runtimeKinds: ['apptainer'],
    gpuIds: [],
    maxConcurrentJobs: 4,
    enabled: true,
    visibility: 'public',
    supportsArray: true,
    site: {
      launcherId: createdLauncher.launcher.id,
      connection: { host: 'login.abci.example.invalid', knownHosts: ABCI_KNOWN_HOSTS },
      accountMode: 'personal',
      workDirectory: '/groups/gaa00000/mmt',
    },
    jobShell: '#!/bin/sh\nqsub -- "$MMT_RUNNER" "$MMT_SPEC_DIR"\n',
  },
});
const sshServer = (name, settings) => ({
  name,
  executor: 'ssh',
  port: 22,
  pythonExecutable: 'python3',
  enabled: true,
  ...settings,
});
await call('POST', '/targets', {
  cookie: admin,
  body: sshServer('Admin workstation', {
    host: 'admin-ws.example.invalid',
    username: 'admin',
    sshKeyPath: '/keys/admin',
    knownHostsPath: '/keys/known_hosts',
    workDirectory: '/srv/admin-mmt',
    runtimeKinds: ['python', 'docker'],
    gpuIds: ['0'],
    maxConcurrentJobs: 1,
    visibility: 'private',
  }),
});
await call('POST', '/targets', {
  cookie: admin,
  body: sshServer('GPU server', {
    host: 'gpu.example.invalid',
    username: 'mmt',
    sshKeyPath: '/keys/gpu',
    knownHostsPath: '/keys/known_hosts',
    workDirectory: '/srv/mmt',
    runtimeKinds: ['python'],
    gpuIds: [],
    maxConcurrentJobs: 2,
    visibility: 'public',
  }),
});
// 追加ダイアログでjob shellのひな形「direct-docker」を選んだときに入る内容。
await call('POST', '/targets', {
  cookie: aoki,
  body: {
    ...noConnection,
    name: 'Aoki PC',
    executor: 'site',
    runtimeKinds: ['docker'],
    gpuIds: [],
    maxConcurrentJobs: 1,
    enabled: true,
    visibility: 'private',
    submissionMode: 'manual',
    supportsArray: false,
    site: { workDirectory: '/home/aoki/mmt', gpuAssignment: 'lease' },
    jobShell: await readFile(JOB_SHELL_EXAMPLE, 'utf8'),
  },
});

const projectNames = Object.fromEntries(Object.entries(projectText).map(([key, project]) => [key, project.name]));
const state = { projectIds, userIds, names: { people: PEOPLE[lang], projects: projectNames } };
await writeFile(stateFile, `${JSON.stringify(state, null, 2)}\n`);
console.log(`seeded ${Object.keys(projectIds).length} projects and ${Object.keys(userIds).length} users`);
