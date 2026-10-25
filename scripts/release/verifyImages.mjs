import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout } from 'node:timers/promises';
import { parse, stringify } from 'yaml';
import { buildReleaseBundle, readReleaseImages } from './buildBundle.mjs';

// Covers a cold database/API startup, and fails instead of waiting indefinitely for a broken image.
const API_STARTUP_TIMEOUT_MS = 90_000;
const API_POLL_INTERVAL_MS = 1_000;
const COMMAND_TIMEOUT_MS = 180_000;
const tag = process.argv[2];
const manifestDirectory = process.argv[3];
const owner = (process.env.GITHUB_REPOSITORY_OWNER ?? 'aida0710').toLowerCase();
const workspace = await mkdtemp(join(tmpdir(), 'mmt-image-verification-'));
const projectName = `mmt-release-check-${randomBytes(5).toString('hex')}`;
const fixturePassword = randomBytes(24).toString('hex');
const fixtureStorageKey = randomBytes(32).toString('base64');
let composeDirectory;

function runCommand(command, commandArguments, options = {}) {
  return execFileSync(command, commandArguments, {
    encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: COMMAND_TIMEOUT_MS, ...options,
  });
}

function runCompose(commandArguments) {
  return runCommand('docker', ['compose', '-p', projectName, ...commandArguments], { cwd: composeDirectory });
}

function requestFromApi(path) {
  return JSON.parse(runCompose(['exec', '-T', 'api', 'node', '--input-type=module', '-e',
    `const response = await fetch('http://127.0.0.1:4182${path}');` +
    'console.log(JSON.stringify({status: response.status, text: await response.text()}));']));
}

try {
  const bundle = await buildReleaseBundle({ tag, outputDirectory: workspace, manifestDirectory, owner });
  runCommand('tar', ['-xzf', bundle.archive, '-C', workspace]);
  composeDirectory = join(workspace, `mado-ml-tracking-${tag}`);
  const composeFile = join(composeDirectory, 'compose.yml');
  const composeSettings = parse(await readFile(composeFile, 'utf8'));
  assert.ok(Object.values(composeSettings.services).every((service) => !service.build));
  // Verification uses the internal network, leaving every host listener and development DB alone.
  delete composeSettings.services.web.ports;
  await writeFile(composeFile, stringify(composeSettings));
  await writeFile(join(composeDirectory, '.env'), [
    `MMT_POSTGRES_PASSWORD=${fixturePassword}`, `MMT_STORAGE_SECRET_KEY=${fixtureStorageKey}`,
    'AUTH_MODE=local', 'MMT_PUBLIC_URL=https://tracking.example.test',
    'MMT_WEB_ORIGIN=https://tracking.example.test', 'MMT_ALLOW_PRIVATE_ORIGINS=false', '',
  ].join('\n'), { mode: 0o600 });
  runCompose(['config', '--quiet']);
  runCompose(['up', '-d', 'postgres', '--wait', '--wait-timeout', String(API_STARTUP_TIMEOUT_MS / 1_000)]);
  runCompose(['run', '--rm', '-T', 'api', 'npm', 'run', 'db:migrate', '-w', '@mmt/api']);
  runCompose(['up', '-d', 'api', 'preview', 'web']);
  const deadline = Date.now() + API_STARTUP_TIMEOUT_MS;
  while (true) {
    try {
      const health = requestFromApi('/api/health');
      assert.equal(health.status, 200);
      assert.equal(JSON.parse(health.text).status, 'ok');
      break;
    } catch (error) {
      if (Date.now() >= deadline) throw error;
      await setTimeout(API_POLL_INTERVAL_MS);
    }
  }
  assert.equal(requestFromApi('/api/projects').status, 401);
  const auth = requestFromApi('/api/auth/config');
  assert.equal(auth.status, 200);
  assert.equal(JSON.parse(auth.text).methods.local, true);
  assert.match(runCompose(['exec', '-T', 'web', 'wget', '-qO-', 'http://127.0.0.1:8080/']), /<html/);
  assert.match(runCompose(['exec', '-T', 'web', 'wget', '-qO-', 'http://127.0.0.1:8080/api/health']), /"status":"ok"/);
  const previewContainer = runCompose(['ps', '-q', 'preview']).trim();
  assert.equal(runCommand('docker', ['inspect', '--format', '{{.State.Running}}', previewContainer]).trim(), 'true');
  const references = await readReleaseImages({ tag, manifestDirectory, owner });
  for (const service of ['worker', 'launcher']) {
    assert.match(runCommand('docker', ['run', '--rm', references[service], '--help']), /usage:/i);
  }
  process.stdout.write('Release images: migrations, HTTP, authentication, preview and worker/launcher CLI passed\n');
} catch (error) {
  // Fixture credentials are generated for this verification; omit even those from diagnostic output.
  const diagnostics = String(error.stderr ?? error.message)
    .replaceAll(fixturePassword, '[redacted]').replaceAll(fixtureStorageKey, '[redacted]');
  process.stderr.write(`${diagnostics}\n`);
  process.exitCode = 1;
} finally {
  if (composeDirectory) {
    try { runCompose(['down', '--volumes', '--remove-orphans']); } catch { process.exitCode = 1; }
  }
  await rm(workspace, { recursive: true, force: true });
}
