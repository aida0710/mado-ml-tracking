import path from 'node:path';

/** 入力中のパスを補完するディレクトリをどこで探し、どの名前を候補にするか。 */
export interface DirectorySuggestionPlan {
  /** 入力したパスの絶対パス。filesystemの保存先がrootPathを解決するのと同じ方法で求める。 */
  resolvedPath: string;
  /** 子が候補になるディレクトリ。 */
  listedDirectory: string;
  /** 候補の名前が始まる文字列。入力の最後の要素で、末尾が"/"のときは空。 */
  namePrefix: string;
  /** 隠し名（"."で始まる）を含めるのは、入力の最後の要素が"."で始まるときだけ。 */
  includesHidden: boolean;
}

/**
 * "/data/"は/dataの子を、"/data/ex"は/dataの子のうち"ex"で始まるものを並べる。相対パスは、
 * filesystemの保存先と同じく`workingDirectory`から解決する。
 */
export function planDirectorySuggestions(
  typedPath: string,
  workingDirectory: string,
): DirectorySuggestionPlan {
  const lastSeparator = typedPath.lastIndexOf('/');
  const namePrefix = typedPath.slice(lastSeparator + 1);
  return {
    resolvedPath: path.resolve(workingDirectory, typedPath),
    listedDirectory: path.resolve(workingDirectory, typedPath.slice(0, lastSeparator + 1)),
    namePrefix,
    includesHidden: namePrefix.startsWith('.'),
  };
}

/**
 * OSの最上位のディレクトリ（Linuxのファイルシステム階層）。Artifactを置く場所ではなく、
 * 先に並べるとデータ用のディスク（/srv、/mnt、/homeなど）が埋もれる。これらのパスを全部
 * 打ち込めば使えるが、候補には出さない。
 */
const SYSTEM_DIRECTORY_NAMES: ReadonlySet<string> = new Set([
  'bin',
  'boot',
  'cdrom',
  'dev',
  'etc',
  'lib',
  'lib32',
  'lib64',
  'libx32',
  'lost+found',
  'proc',
  'root',
  'run',
  'sbin',
  'snap',
  'sys',
  'tmp',
  'usr',
]);

export function isSuggestedName(name: string, plan: DirectorySuggestionPlan): boolean {
  if (plan.listedDirectory === '/' && SYSTEM_DIRECTORY_NAMES.has(name)) return false;
  return name.startsWith(plan.namePrefix) && (plan.includesHidden || !name.startsWith('.'));
}

/** UTF-16のコード単位の順。サーバーのロケールで順序が変わらないようにする。 */
export function compareDirectoryNames(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
