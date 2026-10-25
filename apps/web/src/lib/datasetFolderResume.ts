// バージョンを作る前に止まったフォルダのアップロードを続ける。選んだフォルダがどの試行の
// 続きか、そのファイルのうちどれを前の試行が既に保存したか。
import {
  DATASET_FOLDER_UPLOAD_FOLDER_PATTERN,
  datasetFolderUploadRoot,
  type ArtifactUploadListItem,
  type DatasetFolderUpload,
} from '@mmt/contracts';
import type { DatasetFolderEntry } from './datasetFolder';

/** 前の試行で保存したファイル。同じパスの選んだファイルと比べるもの。 */
export interface StoredFolderFile {
  id: string;
  path: string;
  size: number;
  sha256: string;
}

/** ダイアログに出す止まったフォルダのアップロード。保存済みのファイルと本人の開いているアップロード。 */
export interface UnfinishedFolderUpload {
  folder: string;
  startedAt: string;
  storedFileCount: number;
  storedBytes: number;
  /** 最後のファイルを保存した日時。開いているアップロードしか分からないときはnull。 */
  lastStoredAt: string | null;
  /** 大きいファイルは分割して送る。そのセッションは、完了するか期限が切れるまで開いたまま。 */
  openUploads: ArtifactUploadListItem[];
}

const folderPattern = new RegExp(DATASET_FOLDER_UPLOAD_FOLDER_PATTERN);

/** フォルダ名は開始時刻の':'と'.'を置き換えたもの（2026-10-08T14-19-08-955Z）。 */
export function folderUploadStartTime(folder: string): string {
  const [date, time] = folder.split('T');
  const [hours, minutes, seconds, milliseconds] = (time ?? '').replace(/Z$/, '').split('-');
  return `${date}T${hours}:${minutes}:${seconds}.${milliseconds}Z`;
}

/** Artifactのパスが属するフォルダのアップロードのフォルダ。ほかのパスならnull。 */
export function folderOfUploadPath(path: string, datasetId: string): string | null {
  const root = datasetFolderUploadRoot(datasetId);
  if (!path.startsWith(root)) return null;
  const [folder, ...rest] = path.slice(root.length).split('/');
  return folder && rest.length > 0 && folderPattern.test(folder) ? folder : null;
}

/**
 * APIの一覧（どのバージョンも使っていない保存済みのファイル）と、同じフォルダの下にある本人の
 * 開いているアップロードを合わせ、新しい順に並べる。開いているアップロードしか無いフォルダも
 * 出す。最初に止まったのが大きいファイルかもしれないため。
 */
export function mergeUnfinishedFolderUploads({
  datasetId,
  stored,
  openUploads,
}: {
  datasetId: string;
  stored: readonly DatasetFolderUpload[];
  openUploads: readonly ArtifactUploadListItem[];
}): UnfinishedFolderUpload[] {
  const byFolder = new Map<string, UnfinishedFolderUpload>(
    stored.map((upload) => [
      upload.folder,
      {
        folder: upload.folder,
        startedAt: folderUploadStartTime(upload.folder),
        storedFileCount: upload.fileCount,
        storedBytes: upload.totalSize,
        lastStoredAt: upload.lastStoredAt,
        openUploads: [],
      },
    ]),
  );
  for (const session of openUploads) {
    if (session.runId !== null) continue;
    const folder = folderOfUploadPath(session.path, datasetId);
    if (!folder) continue;
    const row = byFolder.get(folder) ?? {
      folder,
      startedAt: folderUploadStartTime(folder),
      storedFileCount: 0,
      storedBytes: 0,
      lastStoredAt: null,
      openUploads: [],
    };
    row.openUploads.push(session);
    byFolder.set(folder, row);
  }
  return [...byFolder.values()].sort((left, right) => right.startedAt.localeCompare(left.startedAt));
}

/**
 * 選んだファイルのうち、前の試行が同じパスに同じサイズで保存したもの。ハッシュを計算する価値が
 * あるのはこれだけ。サイズが違えば別のファイルで、パスが無ければ保存されていない。
 */
export function pairWithStoredFiles(
  entries: readonly DatasetFolderEntry[],
  stored: readonly StoredFolderFile[],
): Array<{ entry: DatasetFolderEntry; stored: StoredFolderFile }> {
  const storedByPath = new Map(stored.map((file) => [file.path, file]));
  return entries.flatMap((entry) => {
    const candidate = storedByPath.get(entry.artifactPath);
    return candidate && candidate.size === entry.source.file.size ? [{ entry, stored: candidate }] : [];
  });
}

/**
 * 選んだファイルのうち、試行が同じパス・同じサイズで既に持っている（保存済みか一部送信済みの）
 * ファイルの数。フォルダがどの試行の続きかをこれで決め、バイト列は始まってから比べる。
 */
export function countContinuedFiles({
  entries,
  storedFiles,
  openUploads,
}: {
  entries: readonly DatasetFolderEntry[];
  storedFiles: readonly StoredFolderFile[];
  openUploads: readonly ArtifactUploadListItem[];
}): number {
  const sizeByPath = new Map<string, number>([
    ...storedFiles.map((file): [string, number] => [file.path, file.size]),
    ...openUploads.map((session): [string, number] => [session.path, session.expectedSize]),
  ]);
  return entries.filter((entry) => sizeByPath.get(entry.artifactPath) === entry.source.file.size).length;
}

/**
 * 選んだフォルダが続きである見込みが最も高い、止まった試行。同じパス・同じサイズのファイルが
 * 最も多いもの。ファイルを1つでも共有する試行が無ければnullで、新しいフォルダは最初から始める。
 */
export function chooseFolderToContinue(
  candidates: ReadonlyArray<{ folder: string; matchedCount: number }>,
): { folder: string; matchedCount: number } | null {
  let best: { folder: string; matchedCount: number } | null = null;
  for (const candidate of candidates)
    if (candidate.matchedCount > 0 && candidate.matchedCount > (best?.matchedCount ?? 0)) best = candidate;
  return best;
}
