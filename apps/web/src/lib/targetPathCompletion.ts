import type { TargetDirectoryListingResult } from '@mmt/contracts';

// 候補の一覧のおよそ1画面分。残りは打ち込んで絞り込む。
export const MAX_PATH_SUGGESTIONS = 50;

/** パスの欄が補完する先。ディレクトリ（作業ディレクトリ）か実行ファイル（Python）。 */
export type PathCompletionKind = 'directory' | 'executable';

/**
 * 打ち込んだパスのディレクトリの部分（最後の/まで。/を含む）と、その中の名前の先頭部分。
 * `/home/mmt/pro`は`/home/mmt/`と`pro`になる。/の無いパスにはディレクトリが無い。
 */
export function splitTypedPath(value: string): { directory: string; fragment: string } {
  const slash = value.lastIndexOf('/');
  if (slash < 0) return { directory: '', fragment: value };
  return { directory: value.slice(0, slash + 1), fragment: value.slice(slash + 1) };
}

/** コンピュータが読めるディレクトリを指す、打ち込んだパス。絶対パスか~/の下で、/で終わる。 */
export function directoryToRead(value: string): string | null {
  const { directory } = splitTypedPath(value);
  if (!directory || !(directory.startsWith('/') || directory.startsWith('~/'))) return null;
  return directory;
}

/** 打ち込んだものの続きになる既知のパス。欄が空ならすべて。 */
export function completeFromKnownPaths(paths: readonly string[], value: string): string[] {
  return paths.filter((path) => path.startsWith(value) && path !== value);
}

/**
 * 読んだディレクトリの項目のうち打ち込んだ名前の続きになるものを、打ち込んだ形のフルパスで返す
 * （~/は~/のまま）。ディレクトリは次の階層を読めるよう/で終え、Pythonの欄には実行ファイルを出す。
 * 隠し項目は、シェルと同じく.で始まる名前を打ったときだけ出す。
 */
export function completeFromListing(
  value: string,
  listing: TargetDirectoryListingResult,
  kind: PathCompletionKind,
): string[] {
  const { directory, fragment } = splitTypedPath(value);
  return listing.entries
    .filter(
      (entry) =>
        entry.name.startsWith(fragment) && (fragment.startsWith('.') || !entry.name.startsWith('.')),
    )
    .filter((entry) => entry.kind === 'directory' || (kind === 'executable' && entry.executable))
    .map((entry) => `${directory}${entry.name}${entry.kind === 'directory' ? '/' : ''}`);
}

/** 重複を除き、順を保った候補。一覧に出せる数まで。 */
export function mergeSuggestions(...groups: string[][]): string[] {
  return [...new Set(groups.flat())].slice(0, MAX_PATH_SUGGESTIONS);
}
