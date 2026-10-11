// Continuing a folder upload that stopped before its version: which attempt a chosen folder
// continues, and which of its files an earlier attempt already stored.
import {
  DATASET_FOLDER_UPLOAD_FOLDER_PATTERN,
  datasetFolderUploadRoot,
  type ArtifactUploadListItem,
  type DatasetFolderUpload,
} from '@mmt/contracts';
import type { DatasetFolderEntry } from './datasetFolder';

/** A stored file of an earlier attempt: what is compared with the chosen file at the same path. */
export interface StoredFolderFile {
  id: string;
  path: string;
  size: number;
  sha256: string;
}

/** A stopped folder upload as the dialog lists it: stored files and this person's open uploads. */
export interface UnfinishedFolderUpload {
  folder: string;
  startedAt: string;
  storedFileCount: number;
  storedBytes: number;
  /** When the last file was stored; null when only open uploads are known. */
  lastStoredAt: string | null;
  /** Bigger files go up in parts; their sessions stay open until they finish or expire. */
  openUploads: ArtifactUploadListItem[];
}

const folderPattern = new RegExp(DATASET_FOLDER_UPLOAD_FOLDER_PATTERN);

/** The folder name is the start time with ':' and '.' replaced: 2026-10-08T14-19-08-955Z. */
export function folderUploadStartTime(folder: string): string {
  const [date, time] = folder.split('T');
  const [hours, minutes, seconds, milliseconds] = (time ?? '').replace(/Z$/, '').split('-');
  return `${date}T${hours}:${minutes}:${seconds}.${milliseconds}Z`;
}

/** The folder of a folder upload an Artifact path belongs to, or null for any other path. */
export function folderOfUploadPath(path: string, datasetId: string): string | null {
  const root = datasetFolderUploadRoot(datasetId);
  if (!path.startsWith(root)) return null;
  const [folder, ...rest] = path.slice(root.length).split('/');
  return folder && rest.length > 0 && folderPattern.test(folder) ? folder : null;
}

/**
 * Joins what the API lists (stored files no version uses) with the person's own open uploads
 * below the same folders, newest first. A folder with only open uploads is listed too: a big
 * file may have been the first to stop.
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
 * Chosen files whose path an earlier attempt stored with the same size. Only these are worth
 * hashing: a different size is a different file, and a missing path was never stored.
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
 * How many chosen files an attempt already holds, stored or partly sent, at the same path and
 * size. It decides which attempt a folder continues; the bytes are compared once it starts.
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
 * The stopped attempt the chosen folder most likely continues: the one with the most files at the
 * same path and size. None when no attempt shares a single file, so a new folder starts fresh.
 */
export function chooseFolderToContinue(
  candidates: ReadonlyArray<{ folder: string; matchedCount: number }>,
): { folder: string; matchedCount: number } | null {
  let best: { folder: string; matchedCount: number } | null = null;
  for (const candidate of candidates)
    if (candidate.matchedCount > 0 && candidate.matchedCount > (best?.matchedCount ?? 0)) best = candidate;
  return best;
}
