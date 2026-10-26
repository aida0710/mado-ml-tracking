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

// fixtureはリポジトリ自身のmanifestを使うので、そのタグは現在のバージョンに従う。
const VERSION = JSON.parse(await readFile(join(REPOSITORY_ROOT, 'package.json'), 'utf8')).version;
const TAG = `v${VERSION}`;
const FIXTURE_DIGEST = `sha256:${'1'.repeat(64)}`;
const FIXTURE_SOURCE_DATE_EPOCH = '1700000000';

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

// fixtureはgitのリポジトリではないので、tarに付ける日時（buildBundle.mjsはcommitの日時を使う）を渡す。
async function buildAndExtractFixtureBundle(fixture) {
  const originalEpoch = process.env.SOURCE_DATE_EPOCH;
  process.env.SOURCE_DATE_EPOCH = FIXTURE_SOURCE_DATE_EPOCH;
  let bundle;
  try { bundle = await buildReleaseBundle(fixture); }
  finally {
    if (originalEpoch === undefined) delete process.env.SOURCE_DATE_EPOCH;
    else process.env.SOURCE_DATE_EPOCH = originalEpoch;
  }
  const entries = execFileSync('tar', ['-tzf', bundle.archive], { encoding: 'utf8' });
  execFileSync('tar', ['-xzf', bundle.archive, '-C', fixture.outputDirectory]);
  return { bundle, entries, extracted: join(fixture.outputDirectory, `mado-ml-tracking-${TAG}`) };
}

test('配布物は固定イメージから起動し、任意の実行サービスと設定例を保つ', async () => {
  const fixture = await createFixture();
  try {
    await writeFile(join(fixture.repositoryRoot, '.env'), 'DO_NOT_SHIP=private-fixture-value\n');
    const { bundle, entries, extracted } = await buildAndExtractFixtureBundle(fixture);
    assert.doesNotMatch(entries, /\/\.env\n|node_modules|private-fixture-value/);
    assert.match(entries, /\.env\.example/);
    assert.match(entries, /\/LICENSE\n/);
    assert.match(entries, /\/NOTICE\n/);
    const compose = parse(await readFile(join(extracted, 'compose.yml'), 'utf8'));
    assert.ok(Object.values(compose.services).every((service) => !service.build));
    for (const { service, image } of RELEASE_IMAGES) {
      assert.equal(compose.services[service].image, `ghcr.io/aida0710/${image}@${FIXTURE_DIGEST}`);
    }
    assert.deepEqual(compose.services.worker.profiles, ['worker']);
    assert.deepEqual(compose.services.launcher.profiles, ['launcher']);
    assert.equal(compose.services.api.environment.MMT_AUTH_MODE, '${MMT_AUTH_MODE:-local}');
    assert.equal(compose.services.forgejo.image, 'codeberg.org/forgejo/forgejo:16.0.5-rootless');
    execFileSync('sha256sum', ['-c', bundle.checksum], { cwd: fixture.outputDirectory });
  } finally { await rm(fixture.repositoryRoot, { recursive: true, force: true }); }
});

// 運用では配布物のcompose.ymlに、ファイルシステムの保存先の上書きと環境ごとのcompose.override.ymlを
// 重ねて動かす（deploy/release/README.md）。上書きが指すサービスは配布物の固定イメージでなければならない。
test('ファイルシステムの保存先の上書きは、配布物の固定イメージのサービスに重なる', async () => {
  const fixture = await createFixture();
  try {
    const { entries, extracted } = await buildAndExtractFixtureBundle(fixture);
    assert.match(entries, /\/compose\.filesystem-storage\.yml\n/);
    const compose = parse(await readFile(join(extracted, 'compose.yml'), 'utf8'));
    const filesystemStorage = parse(await readFile(join(extracted, 'compose.filesystem-storage.yml'), 'utf8'));
    const overriddenServices = Object.keys(filesystemStorage.services);
    assert.ok(overriddenServices.length > 0);
    for (const service of overriddenServices) {
      assert.match(compose.services[service].image, /@sha256:[0-9a-f]{64}$/);
      assert.equal(filesystemStorage.services[service].build, undefined);
    }
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
