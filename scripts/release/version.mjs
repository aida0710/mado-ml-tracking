import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

export const REPOSITORY_ROOT = fileURLToPath(new URL('../../', import.meta.url));
const RELEASE_TAG_PATTERN = /^v(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$/;
const PACKAGE_PATHS = [
  'package.json', 'apps/api/package.json', 'apps/web/package.json',
  'packages/contracts/package.json', 'packages/platform/package.json',
];

export async function verifyReleaseVersion({ tag, repositoryRoot = REPOSITORY_ROOT }) {
  if (!RELEASE_TAG_PATTERN.test(tag ?? '')) throw new Error('Expected a release tag such as v0.1.0');
  const version = tag.slice(1);
  for (const packagePath of PACKAGE_PATHS) {
    const manifest = JSON.parse(await readFile(join(repositoryRoot, packagePath), 'utf8'));
    if (manifest.version !== version) throw new Error(`${packagePath} does not match ${tag}`);
  }
  const lock = JSON.parse(await readFile(join(repositoryRoot, 'package-lock.json'), 'utf8'));
  if (lock.version !== version || lock.packages[''].version !== version) {
    throw new Error(`package-lock.json does not match ${tag}`);
  }
  const pythonManifest = await readFile(join(repositoryRoot, 'python/pyproject.toml'), 'utf8');
  const pythonVersion = pythonManifest.split('[project]')[1]?.match(/^version\s*=\s*"([^"]+)"/m)?.[1];
  if (pythonVersion !== version) throw new Error(`Python SDK version does not match ${tag}`);
  const notes = await readFile(join(repositoryRoot, 'docs/releases', `${tag}.md`), 'utf8');
  if (!notes.trim()) throw new Error(`Release notes are empty for ${tag}`);
  return version;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await verifyReleaseVersion({ tag: process.argv[2] });
  process.stdout.write('Release versions and notes match\n');
}
