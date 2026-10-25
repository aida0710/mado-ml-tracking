import type { Artifact } from './index.js';

/**
 * latest: パスごとに、Runが今見せているArtifact。all: 保存済みのアップロードすべて（古いものも
 * 含む）。
 */
export type ArtifactListVersions = 'latest' | 'all';

/** Artifactの一覧の1ページ。最後のページにはnextCursorが無い。 */
export interface ArtifactPage {
  items: Artifact[];
  nextCursor?: string;
}

/** 指定したprefixの直下のディレクトリ。数にはその下のすべてのファイルを含む。 */
export interface ArtifactDirectoryEntry {
  /** `/`で終わる、ディレクトリの完全なパス。 */
  prefix: string;
  fileCount: number;
  totalSize: number;
}

/** GET /projects/:p/runs/:r/artifacts/tree: Runの最新のArtifactのうち1階層分。 */
export interface ArtifactTree {
  /** ルートなら''、それ以外は`/`で終わるディレクトリのパス。 */
  prefix: string;
  directories: ArtifactDirectoryEntry[];
  /** 応答に入りきらない子ディレクトリがあるときtrue。 */
  directoriesTruncated: boolean;
  /** このディレクトリの直下のファイル。サブディレクトリの中は含まない。 */
  fileCount: number;
  totalSize: number;
}
