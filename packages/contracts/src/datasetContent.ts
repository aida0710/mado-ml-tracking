/**
 * 'reference': uriとdigestが、ほかの場所に保存されたデータを表す（MLflowのlog_inputs、
 * 連携からの取り込み）。
 * 'artifacts': バージョンの中身は列挙したArtifact。uriは`mmt-dataset://<versionId>`で、digestは
 * サーバーが計算したmanifestのdigest。
 */
export type DatasetContentKind = 'reference' | 'artifacts';

/** 作るバージョンの1ファイル。データセットの中でのパスと、保存済みのArtifact。 */
export interface DatasetVersionFileInput {
  path: string;
  artifactId: string;
}

/**
 * CreateDatasetVersion.content。`fromRunArtifacts`は、`prefix`（ディレクトリ。''ならすべて）の
 * 下の各パスにあるRunの最新のArtifactを取り、パスは`prefix`からの相対パスで保存する。
 */
export type DatasetVersionContent =
  | { kind: 'artifacts'; files: DatasetVersionFileInput[] }
  | { kind: 'artifacts'; fromRunArtifacts: { runId: string; prefix?: string } };

/** 'artifacts'のDatasetVersionのファイル。sizeとsha256はArtifactのもので、作成時に決まる。 */
export interface DatasetVersionFile {
  path: string;
  artifactId: string;
  size: number;
  sha256: string;
  mimeType: string;
}

/** GET /projects/:p/datasets/:d/versions/:v/files。最後のページにはnextCursorが無い。 */
export interface DatasetVersionFilePage {
  items: DatasetVersionFile[];
  nextCursor?: string;
}

/**
 * 1つのDatasetVersionに入れられるファイル数の上限（decisions.md）。大きな音声コーパスは
 * 数万クリップになる。この上限で、1回の作成リクエストとそのトランザクションを、APIがメモリに
 * 載せられる大きさに抑える。
 */
export const MAX_DATASET_VERSION_FILES = 100_000;
