import { readFileSync } from 'node:fs';

// リリースのバージョン。このworkspaceのpackage.jsonから読む（scripts/release/version.mjsが
// リポジトリ内のすべてのmanifestを同じバージョンにそろえる）。src/とビルド後のdist/は
// 同じ深さにあるので、どちらからもこのパスで届く。
const manifest = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
) as { version: string };

export const APPLICATION_VERSION = manifest.version;
