import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { parse, stringify } from 'yaml';
import { RELEASE_IMAGES } from './images.mjs';
import { REPOSITORY_ROOT, verifyReleaseVersion } from './version.mjs';

export async function readReleaseImages({ tag, manifestDirectory, owner = 'aida0710' }) {
  if (!/^[a-z0-9-]+$/.test(owner)) throw new Error('Invalid GHCR owner');
  const references = {};
  for (const { service, image } of RELEASE_IMAGES) {
    const imageName = `ghcr.io/${owner}/${image}`;
    if (!manifestDirectory) {
      references[service] = `${imageName}:${tag}`;
      continue;
    }
    const manifest = JSON.parse(await readFile(join(manifestDirectory, `${service}.json`), 'utf8'));
    if (manifest.image !== imageName || !/^sha256:[0-9a-f]{64}$/.test(manifest.digest ?? '')) {
      throw new Error(`Invalid immutable image manifest for ${service}`);
    }
    references[service] = `${imageName}@${manifest.digest}`;
  }
  return references;
}

export async function buildReleaseBundle({
  tag, outputDirectory, manifestDirectory, owner = 'aida0710', repositoryRoot = REPOSITORY_ROOT,
}) {
  const version = await verifyReleaseVersion({ tag, repositoryRoot });
  const references = await readReleaseImages({ tag, manifestDirectory, owner });
  const stage = await mkdtemp(join(tmpdir(), 'mmt-release-bundle-'));
  try {
    const bundleName = `mado-ml-tracking-${tag}`;
    const bundleDirectory = join(stage, bundleName);
    await mkdir(bundleDirectory);
    const compose = parse(await readFile(join(repositoryRoot, 'compose.yml'), 'utf8'));
    for (const { service } of RELEASE_IMAGES) {
      delete compose.services[service].build;
      compose.services[service].image = references[service];
    }
    // リリース版はローカルのアカウントで始まる。Composeを編集しなくてもSSOに切り替えられる。
    compose.services.api.environment.MMT_AUTH_MODE = '${MMT_AUTH_MODE:-local}';
    await writeFile(join(bundleDirectory, 'compose.yml'), stringify(compose));
    for (const [source, destination] of [
      ['deploy/release/README.md', 'README.md'],
      ['LICENSE', 'LICENSE'],
      ['NOTICE', 'NOTICE'],
      ['deploy/release/.env.example', '.env.example'],
      ['compose.filesystem-storage.yml', 'compose.filesystem-storage.yml'],
      ['deploy/sites', 'deploy/sites'],
      ['deploy/worker', 'deploy/worker'],
      ['deploy/forgejo', 'deploy/forgejo'],
    ]) {
      await cp(join(repositoryRoot, source), join(bundleDirectory, destination), { recursive: true });
    }
    await writeFile(join(bundleDirectory, 'VERSION'), `${version}\n`);
    await writeFile(join(bundleDirectory, 'images.txt'), `${Object.values(references).join('\n')}\n`);
    await mkdir(outputDirectory, { recursive: true });
    const archive = resolve(outputDirectory, `${bundleName}.tar.gz`);
    const epoch = process.env.SOURCE_DATE_EPOCH ?? execFileSync(
      'git', ['log', '-1', '--format=%ct'], { cwd: repositoryRoot, encoding: 'utf8' },
    ).trim();
    if (!/^\d+$/.test(epoch)) throw new Error('Invalid source timestamp');
    execFileSync('tar', [
      '--sort=name', `--mtime=@${epoch}`, '--owner=0', '--group=0', '--numeric-owner',
      '-C', stage, '-czf', archive, bundleName,
    ]);
    const digest = createHash('sha256').update(await readFile(archive)).digest('hex');
    await writeFile(`${archive}.sha256`, `${digest}  ${basename(archive)}\n`);
    return { archive, checksum: `${archive}.sha256` };
  } finally {
    await rm(stage, { recursive: true, force: true });
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const bundle = await buildReleaseBundle({
    tag: process.argv[2], outputDirectory: process.argv[3] ?? 'dist/release',
    manifestDirectory: process.argv[4],
    owner: (process.env.GITHUB_REPOSITORY_OWNER ?? 'aida0710').toLowerCase(),
  });
  process.stdout.write(`${bundle.archive}\n${bundle.checksum}\n`);
}
