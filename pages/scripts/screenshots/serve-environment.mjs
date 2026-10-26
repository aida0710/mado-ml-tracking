// ドキュメントのスクリーンショットを撮るAPIとWebの開発サーバーを、それぞれ専用のデータベースで
// 起動・停止・削除する。
//   node pages/scripts/screenshots/serve-environment.mjs start <sample|accounts> [--lang en]
//       [--api-port 4682] [--web-port 5682] [--database mmt_docs_en_sample]
//   node pages/scripts/screenshots/serve-environment.mjs stop <sample|accounts> [--lang en]
//   node pages/scripts/screenshots/serve-environment.mjs drop <sample|accounts> [--lang en]
// MMT_DOCS_POSTGRES_URLでPostgreSQLのサーバーを指定する（そのサーバーのどのデータベースでも
// よい。例: .../postgres）。環境のデータベースはそこに作る。パスワードは生成してmode 600の
// ファイルに書き、出力はしない。
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { chmod, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import pg from 'pg';
import { ENVIRONMENTS, REPOSITORY_ROOT, environmentDirectory, parseArguments } from './screenshotEnvironment.mjs';

const TSX = path.join(REPOSITORY_ROOT, 'node_modules/.bin/tsx');
const VITE = path.join(REPOSITORY_ROOT, 'node_modules/.bin/vite');
const LOOPBACK = '127.0.0.1';
// APIは数秒でヘルスチェックに応答するが、Viteは最初の起動で依存関係のバンドルもする。
const STARTUP_TIMEOUT_MS = 120_000;
const POLL_MS = 500;
// 止めるサーバーに、SIGTERMを送ってからkillするまでに与える終了の猶予。
const STOP_GRACE_MS = 10_000;
// このスクリプトが作成・削除するPostgreSQLの識別子。これらは引用符で囲む工夫をしなくてよい。
const DATABASE_NAME_PATTERN = /^[a-z][a-z0-9_]{0,62}$/;
// 親のシェルの設定のうちサーバーの動きを変えるもの（開発者がexportした.env、SSO、S3。どれもMMT_で始まる）
// は外し、どの環境も同じ設定から始める。
const INHERITED_SETTING_PATTERN = /^MMT_/;

const { options, positional } = parseArguments(process.argv.slice(2));
const [command, environmentName] = positional;
const environment = ENVIRONMENTS[environmentName];
if (!['start', 'stop', 'drop'].includes(command) || !environment)
  throw new Error('usage: serve-environment.mjs <start|stop|drop> <sample|accounts> [--lang ja|en]');
const directory = environmentDirectory(options.lang, environmentName);
const databaseName = options.database ?? `mmt_docs_${options.lang}_${environmentName}`;
if (!DATABASE_NAME_PATTERN.test(databaseName)) throw new Error(`invalid database name: ${databaseName}`);
const environmentFile = (name) => path.join(directory, name);

function serverUrl() {
  const value = process.env.MMT_DOCS_POSTGRES_URL;
  if (!value) throw new Error('Set MMT_DOCS_POSTGRES_URL to the PostgreSQL server, e.g. postgresql://user@127.0.0.1:5432/postgres');
  return new URL(value);
}

function databaseUrl() {
  const url = serverUrl();
  url.pathname = `/${databaseName}`;
  return url.toString();
}

async function withServer(work) {
  const client = new pg.Client({ connectionString: serverUrl().toString() });
  await client.connect();
  try {
    return await work(client);
  } finally {
    await client.end();
  }
}

async function databaseExists(client) {
  const result = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [databaseName]);
  return result.rowCount > 0;
}

async function ensurePortFree(port) {
  await new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once('error', () => reject(new Error(`port ${port} is in use; choose another with --api-port/--web-port`)));
    probe.listen(port, LOOPBACK, () => probe.close(resolve));
  });
}

async function writeSecretFile(name, value) {
  await writeFile(environmentFile(name), value, { mode: 0o600 });
  await chmod(environmentFile(name), 0o600);
}

async function readOrCreateSecret(name) {
  try {
    return (await readFile(environmentFile(name), 'utf8')).trim();
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    // 32バイトのbase64が、APIが暗号鍵に求める形式。
    const value = randomBytes(32).toString('base64');
    await writeSecretFile(name, value);
    return value;
  }
}

function serverEnvironment(settings) {
  const inherited = Object.fromEntries(Object.entries(process.env).filter(([name]) => !INHERITED_SETTING_PATTERN.test(name)));
  return { ...inherited, ...settings };
}

async function runToCompletion(executable, args, { cwd, env, logName }) {
  const log = createWriteStream(environmentFile(logName), { flags: 'a' });
  const child = spawn(executable, args, { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdout.pipe(log);
  child.stderr.pipe(log);
  const code = await new Promise((resolve) => child.once('exit', resolve));
  if (code !== 0) throw new Error(`${path.basename(executable)} ${args.join(' ')} failed; see ${environmentFile(logName)}`);
}

async function startDetached(name, executable, args, { cwd, env }) {
  const log = createWriteStream(environmentFile(`${name}.log`), { flags: 'a' });
  await new Promise((resolve) => log.once('open', resolve));
  // stopがサーバーとその子プロセスをまとめて終わらせられるよう、新しいプロセスグループにする。
  const child = spawn(executable, args, { cwd, env, detached: true, stdio: ['ignore', log, log] });
  child.unref();
  await writeFile(environmentFile(`${name}.pid`), `${child.pid}\n`);
}

async function waitUntilAnswering(url) {
  const deadline = Date.now() + STARTUP_TIMEOUT_MS;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // まだ待ち受けていない。
    }
    await delay(POLL_MS);
  }
  throw new Error(`${url} did not answer within ${STARTUP_TIMEOUT_MS / 1000} s; see the logs in ${directory}`);
}

async function createFirstAdministrator(env) {
  // 最初のローカルの全体管理者を、`npm run bootstrap-admin`と同じように、ターミナル無しで作る。
  const passwordFile = environmentFile('admin-initial-password');
  try {
    await readFile(passwordFile);
    return;
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  await runToCompletion(TSX, [path.join(import.meta.dirname, 'bootstrap-admin.ts'), passwordFile], {
    cwd: REPOSITORY_ROOT,
    env,
    logName: 'bootstrap-admin.log',
  });
}

async function start() {
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const apiPort = Number(options['api-port'] ?? environment.apiPort);
  const webPort = Number(options['web-port'] ?? environment.webPort);
  await ensurePortFree(apiPort);
  await ensurePortFree(webPort);
  await withServer(async (client) => {
    if (!(await databaseExists(client))) await client.query(`CREATE DATABASE ${databaseName}`);
  });
  const webUrl = `http://${LOOPBACK}:${webPort}`;
  const apiUrl = `http://${LOOPBACK}:${apiPort}`;
  const apiEnvironment = serverEnvironment({
    MMT_HOST: LOOPBACK,
    MMT_PORT: String(apiPort),
    MMT_AUTH_MODE: environment.authMode,
    MMT_DEVELOPMENT_ADMIN_EMAIL: 'admin@localhost',
    MMT_DATABASE_URL: databaseUrl(),
    MMT_PUBLIC_URL: webUrl,
    MMT_WEB_ORIGIN: webUrl,
    // 見本のProjectは、学習のJobをこのマシンでLocalのexecutorを使って動かす。
    MMT_ALLOW_LOCAL_EXECUTOR: 'true',
    MMT_ARTIFACT_FILESYSTEM_ROOT: environmentFile('artifacts'),
    // ドキュメントに載せるストレージの画面のとおり、seedが秘密の値を持つS3の保存先を
    // 足せるようにする。
    MMT_STORAGE_SECRET_KEY: await readOrCreateSecret('storage-secret-key'),
  });
  await mkdir(environmentFile('artifacts'), { recursive: true });
  await runToCompletion(TSX, ['src/migrate.ts'], { cwd: path.join(REPOSITORY_ROOT, 'apps/api'), env: apiEnvironment, logName: 'migrate.log' });
  if (environment.authMode === 'local') await createFirstAdministrator(apiEnvironment);
  await startDetached('api', TSX, ['src/server.ts'], { cwd: path.join(REPOSITORY_ROOT, 'apps/api'), env: apiEnvironment });
  await startDetached('web', VITE, ['--port', String(webPort), '--strictPort', '--host', LOOPBACK], {
    cwd: path.join(REPOSITORY_ROOT, 'apps/web'),
    env: serverEnvironment({ MMT_WEB_API_PROXY_TARGET: apiUrl }),
  });
  await waitUntilAnswering(`${apiUrl}/healthz`);
  await waitUntilAnswering(webUrl);
  const description = {
    lang: options.lang,
    environment: environmentName,
    authMode: environment.authMode,
    apiUrl,
    webUrl,
    database: databaseName,
    // ストレージの画面に、既定の保存先のディレクトリとして出る。
    artifactsDirectory: environmentFile('artifacts'),
  };
  await writeFile(environmentFile('environment.json'), `${JSON.stringify(description, null, 2)}\n`);
  console.log(`${environmentName} (${options.lang}) is running: Web ${webUrl}, API ${apiUrl}, database ${databaseName}`);
}

function isRunning(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

// PIDファイルはプロセスより長く残ることがある（再起動など）。同じPIDがほかのプログラムに
// 再利用されていれば、手を出さない。
async function isStartedFromThisCheckout(pid) {
  try {
    return (await readFile(`/proc/${pid}/cmdline`, 'utf8')).includes(REPOSITORY_ROOT);
  } catch {
    return false;
  }
}

async function stopProcessGroup(pid) {
  if (!isRunning(pid) || !(await isStartedFromThisCheckout(pid))) return;
  process.kill(-pid, 'SIGTERM');
  const deadline = Date.now() + STOP_GRACE_MS;
  while (isRunning(pid) && Date.now() < deadline) await delay(POLL_MS);
  if (isRunning(pid)) process.kill(-pid, 'SIGKILL');
}

async function stop() {
  let entries = [];
  try {
    entries = await readdir(directory);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  // api.pid、web.pid、seed_sample_project.pyがworkerのために書くworker.pid。
  for (const entry of entries.filter((name) => name.endsWith('.pid'))) {
    const pid = Number((await readFile(environmentFile(entry), 'utf8')).trim());
    if (Number.isInteger(pid) && pid > 0) await stopProcessGroup(pid);
    await rm(environmentFile(entry));
    console.log(`stopped ${entry.replace(/\.pid$/, '')} (${pid})`);
  }
  await rm(environmentFile('environment.json'), { force: true });
}

async function drop() {
  await stop();
  const dropped = await withServer(async (client) => {
    if (!(await databaseExists(client))) return false;
    await client.query(`DROP DATABASE ${databaseName}`);
    return true;
  });
  await rm(directory, { recursive: true, force: true });
  console.log(`${dropped ? 'dropped' : 'no'} database ${databaseName}; removed ${directory}`);
}

await { start, stop, drop }[command]();
