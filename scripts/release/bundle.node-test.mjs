import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { parse } from 'yaml';
import { buildReleaseBundle } from './buildBundle.mjs';
import { RELEASE_IMAGES } from './images.mjs';
import { REPOSITORY_ROOT } from './version.mjs';

// The fixture uses the repository's own manifests, so its tag follows the current version.
const VERSION = JSON.parse(await readFile(join(REPOSITORY_ROOT, 'package.json'), 'utf8')).version;
const TAG = `v${VERSION}`;
const FIXTURE_DIGEST = `sha256:${'1'.repeat(64)}`;

async function createFixture() {
  const repositoryRoot = await mkdtemp(join(tmpdir(), 'mmt-bundle-test-'));
  for (const path of [
    'package.json', 'package-lock.json', 'apps/api/package.json', 'apps/web/package.json',
    'packages/contracts/package.json', 'packages/platform/package.json', 'python/pyproject.toml',
    `docs/releases/${TAG}.md`, 'compose.yml', 'compose.filesystem-storage.yml',
    'deploy/release', 'deploy/sites', 'deploy/worker', 'deploy/forgejo', 'LICENSE', 'NOTICE',
  ]) {
    await cp(join(REPOSITORY_ROOT, path), join(repositoryRoot, path), { recursive: true });
  }
  const manifestDirectory = join(repositoryRoot, 'manifests');
  await mkdir(manifestDirectory);
  for (const { service, image } of RELEASE_IMAGES) {
    await writeFile(join(manifestDirectory, `${service}.json`), JSON.stringify({
      image: `ghcr.io/aida0710/${image}`, digest: FIXTURE_DIGEST,
    }));
  }
  return { repositoryRoot, manifestDirectory, outputDirectory: join(repositoryRoot, 'output'), tag: TAG };
}

test('配布物は固定イメージから起動し、任意の実行サービスと設定例を保つ', async () => {
  const fixture = await createFixture();
  try {
    await writeFile(join(fixture.repositoryRoot, '.env'), 'DO_NOT_SHIP=private-fixture-value\n');
    const originalEpoch = process.env.SOURCE_DATE_EPOCH;
    process.env.SOURCE_DATE_EPOCH = '1700000000';
    let bundle;
    try { bundle = await buildReleaseBundle(fixture); }
    finally {
      if (originalEpoch === undefined) delete process.env.SOURCE_DATE_EPOCH;
      else process.env.SOURCE_DATE_EPOCH = originalEpoch;
    }
    const entries = execFileSync('tar', ['-tzf', bundle.archive], { encoding: 'utf8' });
    assert.doesNotMatch(entries, /\/\.env\n|node_modules|private-fixture-value/);
    assert.match(entries, /\.env\.example/);
    assert.match(entries, /\/LICENSE\n/);
    assert.match(entries, /\/NOTICE\n/);
    execFileSync('tar', ['-xzf', bundle.archive, '-C', fixture.outputDirectory]);
    const extracted = join(fixture.outputDirectory, `mado-ml-tracking-${TAG}`);
    const compose = parse(await readFile(join(extracted, 'compose.yml'), 'utf8'));
    assert.ok(Object.values(compose.services).every((service) => !service.build));
    for (const { service, image } of RELEASE_IMAGES) {
      assert.equal(compose.services[service].image, `ghcr.io/aida0710/${image}@${FIXTURE_DIGEST}`);
    }
    assert.deepEqual(compose.services.worker.profiles, ['worker']);
    assert.deepEqual(compose.services.launcher.profiles, ['launcher']);
    assert.equal(compose.services.api.environment.AUTH_MODE, '${AUTH_MODE:-local}');
    assert.equal(compose.services.forgejo.image, 'codeberg.org/forgejo/forgejo:16.0.5-rootless');
    execFileSync('sha256sum', ['-c', bundle.checksum], { cwd: fixture.outputDirectory });
  } finally { await rm(fixture.repositoryRoot, { recursive: true, force: true }); }
});

test('SDKのバージョンがタグと違うと配布物を作らない', async () => {
  const fixture = await createFixture();
  try {
    const pythonManifest = join(fixture.repositoryRoot, 'python/pyproject.toml');
    const original = await readFile(pythonManifest, 'utf8');
    const mismatched = original.replace(`version = "${VERSION}"`, 'version = "0.0.0"');
    assert.notEqual(mismatched, original, 'The fixture must change the SDK version');
    await writeFile(pythonManifest, mismatched);
    await assert.rejects(buildReleaseBundle(fixture), /Python SDK version/);
  } finally { await rm(fixture.repositoryRoot, { recursive: true, force: true }); }
});

test('別のイメージや変更可能なタグを指すmanifestは配布しない', async () => {
  const fixture = await createFixture();
  try {
    const apiManifest = join(fixture.manifestDirectory, 'api.json');
    await writeFile(apiManifest, JSON.stringify({ image: 'ghcr.io/aida0710/other-api', digest: FIXTURE_DIGEST }));
    await assert.rejects(buildReleaseBundle(fixture), /Invalid immutable image manifest/);
    await writeFile(apiManifest, JSON.stringify({ image: 'ghcr.io/aida0710/mado-ml-tracking-api', digest: 'latest' }));
    await assert.rejects(buildReleaseBundle(fixture), /Invalid immutable image manifest/);
  } finally { await rm(fixture.repositoryRoot, { recursive: true, force: true }); }
});
