// Paths for turning a chosen folder into an 'artifacts' DatasetVersion, and the tree rows of its files.
import { datasetFolderUploadPrefix, type Artifact, type DatasetVersionFile } from '@mmt/contracts';
import type { UploadSource } from './droppedFiles';
import { joinArtifactPath } from './uploadPlan';

/** A chosen file, its path inside the dataset, and the Artifact path it is uploaded to. */
export interface DatasetFolderEntry {
  source: UploadSource;
  datasetPath: string;
  artifactPath: string;
  /** An earlier attempt of this folder upload already stored the same bytes; it is not sent again. */
  storedArtifactId?: string;
}

/**
 * The folder of a new folder upload: its start time, so attempts never share a folder. The name
 * has the form DATASET_FOLDER_UPLOAD_FOLDER_PATTERN describes, which is how the API finds attempts
 * that stopped. A timestamp needs no crypto.randomUUID, which browsers offer on HTTPS origins only.
 */
export function createDatasetFolderUploadFolder(now: Date): string {
  return now.toISOString().replace(/[:.]/g, '-');
}

/**
 * A folder picker names every file `<folder>/<path>`; the folder name is not part of the dataset,
 * so a first segment shared by every file is dropped. Loose files keep their names.
 */
export function datasetPathsOf(sources: UploadSource[]): string[] {
  const segments = sources.map((source) => joinArtifactPath('', source.relativePath).split('/'));
  const top = segments[0]?.[0];
  const sharesTopFolder =
    segments.length > 0 && segments.every((parts) => parts.length > 1 && parts[0] === top);
  return segments.map((parts) => (sharesTopFolder ? parts.slice(1) : parts).join('/'));
}

/**
 * Each folder upload goes to its own Artifact directory under the dataset, so uploads of the same
 * file names for different versions never replace one another in the Project catalog.
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
 * ArtifactTree shows Artifacts; a dataset file is shown under its dataset path with the Artifact's
 * ID, size, and type. Fields the tree does not read are left empty.
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

/** The part of an upload queue row that tells whether a folder file is stored. */
export interface DatasetFolderUploadState {
  id: string;
  path: string;
  status: string;
  artifact: { id: string } | null;
}

/**
 * Which planned files are stored (their Artifact IDs by Artifact path: files an earlier attempt
 * stored, and files the queue finished) and which queue rows still stand between the folder and
 * its version: failed, paused, canceled, or still running.
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
