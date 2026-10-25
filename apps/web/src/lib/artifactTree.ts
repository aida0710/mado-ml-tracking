import type { Artifact, ArtifactDirectoryEntry, ArtifactTree } from '@mmt/contracts';

/** ディレクトリの上に出すパスの1段。ルートはnameが''でprefixが''。 */
export interface ArtifactBreadcrumb {
  name: string;
  prefix: string;
}

export type ArtifactBrowserRow =
  | { kind: 'directory'; key: string; name: string; directory: ArtifactDirectoryEntry }
  | { kind: 'file'; key: string; name: string; artifact: Artifact };

/**
 * ルートが先頭。各段は保存されたとおりに出す。`..`や空の段も名前として扱って解決しないので、
 * どのパンくずも、APIが一覧したのと同じprefixを開く。
 */
export function artifactBreadcrumbs(prefix: string): ArtifactBreadcrumb[] {
  const breadcrumbs: ArtifactBreadcrumb[] = [{ name: '', prefix: '' }];
  let current = '';
  for (const segment of prefix.split('/').slice(0, -1)) {
    current += `${segment}/`;
    breadcrumbs.push({ name: segment, prefix: current });
  }
  return breadcrumbs;
}

/** パスのうち、開いているディレクトリより下の部分。出すものが残らなければ''。 */
export function artifactEntryName(path: string, prefix: string): string {
  return path.startsWith(prefix) ? path.slice(prefix.length) : path;
}

function directoryName(directory: ArtifactDirectoryEntry, prefix: string): string {
  return artifactEntryName(directory.prefix, prefix).replace(/\/$/, '');
}

// 数字は数として比べるので、ファイルマネージャーの表示と同じくstep-9がstep-19より前に来る。
const directoryNameCollator = new Intl.Collator('en', { numeric: true });

/**
 * ファイルマネージャーの表示と同じく、ディレクトリが先でファイルが後。同じ名前のファイルと
 * ディレクトリはどちらも出し、keyは種類で分ける。ディレクトリは一度に全部届くので名前で並べ直す。
 * ファイルはAPIのページの順を保ち、次のページを読んでも後ろに足すだけで済むようにする。
 */
export function artifactDirectoryRows(tree: ArtifactTree, files: Artifact[]): ArtifactBrowserRow[] {
  return [
    ...tree.directories
      .map((directory): ArtifactBrowserRow & { kind: 'directory' } => ({
        kind: 'directory',
        key: `directory:${directory.prefix}`,
        name: directoryName(directory, tree.prefix),
        directory,
      }))
      .sort((left, right) => directoryNameCollator.compare(left.name, right.name)),
    ...files.map((artifact): ArtifactBrowserRow => ({
      kind: 'file',
      key: `file:${artifact.id}`,
      name: artifactEntryName(artifact.path, tree.prefix),
      artifact,
    })),
  ];
}

/** 同じパスにある前のアップロード。新しい順で、表示中のものは除く。 */
export function previousArtifactVersions(versions: Artifact[], current: Artifact): Artifact[] {
  return versions.filter((item) => item.path === current.path && item.id !== current.id);
}
