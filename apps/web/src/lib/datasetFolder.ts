// 選んだフォルダを'artifacts'のDatasetVersionにするときのパスと、そのファイルのツリーの行。
import { datasetFolderUploadPrefix, type Artifact, type DatasetVersionFile } from '@mmt/contracts';
import type { UploadSource } from './droppedFiles';
import { joinArtifactPath } from './uploadPlan';

/** 選んだファイルと、データセットの中でのパスと、アップロード先のArtifactのパス。 */
export interface DatasetFolderEntry {
  source: UploadSource;
  datasetPath: string;
  artifactPath: string;
  /** このフォルダのアップロードの前回の試行で、同じバイト列を既に保存した。もう一度は送らない。 */
  storedArtifactId?: string;
}

/**
 * 新しいフォルダのアップロードのフォルダ。開始時刻を名前にし、試行どうしがフォルダを共有しない
 * ようにする。名前はDATASET_FOLDER_UPLOAD_FOLDER_PATTERNが表す形で、APIはそれで止まった試行を
 * 見つける。時刻ならcrypto.randomUUIDが要らない。ブラウザはそれをHTTPSのoriginでしか提供しない。
 */
export function createDatasetFolderUploadFolder(now: Date): string {
  return now.toISOString().replace(/[:.]/g, '-');
}

/**
 * フォルダの選択ではどのファイルも`<folder>/<path>`という名前になる。フォルダ名はデータセットの
 * 一部ではないので、全ファイルに共通する最初の段は落とす。ばらのファイルは名前のまま。
 */
export function datasetPathsOf(sources: UploadSource[]): string[] {
  const segments = sources.map((source) => joinArtifactPath('', source.relativePath).split('/'));
  const top = segments[0]?.[0];
  const sharesTopFolder =
    segments.length > 0 && segments.every((parts) => parts.length > 1 && parts[0] === top);
  return segments.map((parts) => (sharesTopFolder ? parts.slice(1) : parts).join('/'));
}

/**
 * フォルダのアップロードは、それぞれデータセットの下の専用のArtifactのディレクトリに入れる。
 * 別のバージョンのために同じファイル名をアップロードしても、ProjectのカタログでArtifactが
 * 互いに置き換わらない。
 */
export function planDatasetFolder(
  sources: UploadSource[],
  location: { datasetId: string; folder: string },
): DatasetFolderEntry[] {
  const datasetPaths = datasetPathsOf(sources);
  const prefix = datasetFolderUploadPrefix(location);
  return sources.map((source, index) => {
    const datasetPath = datasetPaths[index]!;
    return { source, datasetPath, artifactPath: joinArtifactPath(prefix, datasetPath) };
  });
}

/**
 * ArtifactTreeはArtifactを表示する。データセットのファイルは、データセットの中のパスの下に、
 * ArtifactのID、サイズ、種類と一緒に出す。ツリーが読まない欄は空にする。
 */
export function datasetFileTreeEntry(file: DatasetVersionFile, projectId: string): Artifact {
  return {
    id: file.artifactId,
    projectId,
    runId: null,
    path: file.path,
    backend: '',
    storageKey: '',
    mimeType: file.mimeType,
    size: file.size,
    sha256: file.sha256,
    createdAt: '',
  };
}

/** アップロードのキューの行のうち、フォルダのファイルが保存されたかを表す部分。 */
export interface DatasetFolderUploadState {
  id: string;
  path: string;
  status: string;
  artifact: { id: string } | null;
}

/**
 * 計画したファイルのうち保存済みのもの（Artifactのパスごとのid。前の試行が保存したものと、キューが
 * 完了したもの）と、バージョンを作る前にまだ片付いていないキューの行（失敗、一時停止、キャンセル、
 * 実行中）。
 */
export function datasetFolderProgress(entries: readonly DatasetFolderEntry[], items: readonly DatasetFolderUploadState[]) {
  const itemsByPath = new Map(items.map((item) => [item.path, item]));
  const storedArtifactIds = new Map<string, string>();
  const unfinishedItemIds: string[] = [];
  for (const entry of entries) {
    if (entry.storedArtifactId) {
      storedArtifactIds.set(entry.artifactPath, entry.storedArtifactId);
      continue;
    }
    const item = itemsByPath.get(entry.artifactPath);
    if (item?.status === 'completed' && item.artifact) storedArtifactIds.set(entry.artifactPath, item.artifact.id);
    else if (item) unfinishedItemIds.push(item.id);
  }
  return {
    storedArtifactIds,
    unfinishedItemIds,
    isUploaded: entries.length > 0 && storedArtifactIds.size === entries.length,
  };
}
