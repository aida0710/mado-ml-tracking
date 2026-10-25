import { readFileSync } from 'node:fs';

// The release version, read from this workspace's package.json (scripts/release/version.mjs keeps
// every manifest in the repository at the same version). The path holds for src/ and the compiled
// dist/, which sit at the same depth.
const manifest = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
) as { version: string };

export const APPLICATION_VERSION = manifest.version;
