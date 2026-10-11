import { useEffect, useRef, useState } from 'react';
import type { Dataset, DatasetVersion, JsonObject } from '@mmt/contracts';
import { registryApi } from '../api/registry';
import {
  createDatasetFolderUploadFolder,
  datasetFolderProgress,
  planDatasetFolder,
  type DatasetFolderEntry,
} from '../lib/datasetFolder';
import { pairWithStoredFiles, type StoredFolderFile } from '../lib/datasetFolderResume';
import type { UploadSource } from '../lib/droppedFiles';
import { sha256OfFile } from '../lib/fileSha256';
import { useArtifactUploadQueue } from './useArtifactUploadQueue';
import { useMutation } from './useMutation';

/** Version fields sent with the file list once every upload has finished. */
export interface DatasetFolderVersionFields {
  /** undefined takes the next integer version. */
  version?: string;
  metadata: JsonObject;
  parentDatasetVersionIds: string[];
}

/** An attempt of this folder upload that stopped before its version, and the files it stored. */
export interface DatasetFolderContinuation {
  folder: string;
  storedFiles: StoredFolderFile[];
}

/** How far the comparison of the chosen files with an earlier attempt's stored files is. */
export interface DatasetFolderMatching {
  checked: number;
  total: number;
}

/**
 * Uploads a folder as standalone Artifacts with the resumable queue, then creates an 'artifacts'
 * DatasetVersion from the completed Artifact IDs. Creation starts by itself once every file is
 * stored; a failed creation is retried by hand, the uploads are not repeated. Files that stopped
 * (failed, paused, or canceled) hold the version back until they are sent again or left out.
 * Continuing an earlier attempt uploads into its folder, so its stored files whose bytes match are
 * listed as they are and its open uploads continue from the parts the server holds.
 */
export function useDatasetFolderVersion({
  projectId,
  dataset,
  onCreated,
}: {
  projectId: string;
  dataset: Dataset;
  onCreated: (version: DatasetVersion) => void;
}) {
  const queue = useArtifactUploadQueue({ projectId, runId: null, onCompleted: () => undefined });
  const creation = useMutation();
  const [entries, setEntries] = useState<DatasetFolderEntry[]>([]);
  const [matching, setMatching] = useState<DatasetFolderMatching | null>(null);
  const fieldsRef = useRef<DatasetFolderVersionFields | null>(null);
  const attemptedRef = useRef(false);
  const matchingControllerRef = useRef<AbortController | null>(null);
  const onCreatedRef = useRef(onCreated);
  onCreatedRef.current = onCreated;

  const { storedArtifactIds, unfinishedItemIds, isUploaded } = datasetFolderProgress(entries, queue.items);
  const isWaitingForChoice = !queue.isActive && unfinishedItemIds.length > 0;
  const reusedEntries = entries.filter((entry) => entry.storedArtifactId);

  async function start(
    sources: UploadSource[],
    fields: DatasetFolderVersionFields,
    continuation: DatasetFolderContinuation | null,
  ) {
    const folder = continuation?.folder ?? createDatasetFolderUploadFolder(new Date());
    const planned = planDatasetFolder(sources, { datasetId: dataset.id, folder });
    fieldsRef.current = fields;
    attemptedRef.current = false;
    if (continuation) {
      const controller = new AbortController();
      matchingControllerRef.current = controller;
      const reused = await findStoredCopies({
        pairs: pairWithStoredFiles(planned, continuation.storedFiles),
        signal: controller.signal,
        onProgress: (progress) => {
          if (!controller.signal.aborted) setMatching(progress);
        },
      });
      if (controller.signal.aborted) return;
      matchingControllerRef.current = null;
      setMatching(null);
      for (const entry of planned) {
        const storedArtifactId = reused.get(entry);
        if (storedArtifactId) entry.storedArtifactId = storedArtifactId;
      }
    }
    setEntries(planned);
    queue.enqueue(
      planned
        .filter((entry) => !entry.storedArtifactId)
        .map((entry) => ({ source: entry.source, path: entry.artifactPath })),
    );
  }

  async function create() {
    const fields = fieldsRef.current;
    if (!fields) return;
    attemptedRef.current = true;
    const version = await creation.run(() =>
      registryApi.createDatasetVersion(projectId, dataset.id, {
        ...fields,
        content: {
          kind: 'artifacts',
          files: entries.map((entry) => ({
            path: entry.datasetPath,
            artifactId: storedArtifactIds.get(entry.artifactPath)!,
          })),
        },
      }),
    );
    if (version) onCreatedRef.current(version);
  }

  /**
   * Stops reading the chosen files for the comparison and goes back to before the start: nothing
   * was sent yet, so the folder can be started again or sent anew.
   */
  function cancelMatching() {
    matchingControllerRef.current?.abort();
    matchingControllerRef.current = null;
    fieldsRef.current = null;
    setMatching(null);
  }

  /** Sends every stopped file again; canceled ones start from the beginning. */
  function resendUnfinished() {
    for (const id of unfinishedItemIds) queue.resume(id);
  }

  /** Creates the version from the stored files only; open sessions of the rest are discarded. */
  function createWithoutUnfinished() {
    for (const id of unfinishedItemIds) void queue.cancel(id);
    setEntries((previous) => previous.filter((entry) => storedArtifactIds.has(entry.artifactPath)));
  }

  useEffect(() => {
    if (isUploaded && !attemptedRef.current) void create();
    // create reads the latest entries and queue state; it runs once when the uploads finish.
  }, [isUploaded]);

  // Closing the dialog stops reading files for the comparison.
  useEffect(() => () => matchingControllerRef.current?.abort(), []);

  return {
    queue,
    entries,
    hasStarted: entries.length > 0 || matching !== null,
    matching,
    cancelMatching,
    isUploaded,
    /** Uploads stopped short of the whole folder; the dialog asks to resend or leave them out. */
    isWaitingForChoice,
    unfinishedCount: unfinishedItemIds.length,
    storedCount: storedArtifactIds.size,
    reusedCount: reusedEntries.length,
    reusedBytes: reusedEntries.reduce((total, entry) => total + entry.source.file.size, 0),
    resendUnfinished,
    createWithoutUnfinished,
    isCreating: creation.pending,
    creationError: creation.error,
    retryCreate: () => void create(),
    start: (
      sources: UploadSource[],
      fields: DatasetFolderVersionFields,
      continuation: DatasetFolderContinuation | null,
    ) => void start(sources, fields, continuation),
  };
}

/**
 * Hashes each chosen file that has a stored file at the same path and size, one at a time, and
 * returns the stored Artifact of those whose bytes are the same. A file that cannot be read is
 * simply uploaded again.
 */
async function findStoredCopies({
  pairs,
  signal,
  onProgress,
}: {
  pairs: Array<{ entry: DatasetFolderEntry; stored: StoredFolderFile }>;
  signal: AbortSignal;
  onProgress: (matching: DatasetFolderMatching) => void;
}): Promise<Map<DatasetFolderEntry, string>> {
  const reused = new Map<DatasetFolderEntry, string>();
  onProgress({ checked: 0, total: pairs.length });
  for (const [index, { entry, stored }] of pairs.entries()) {
    // Web Crypto reads a file whole without the signal, so the stop is checked between files.
    if (signal.aborted) break;
    try {
      if ((await sha256OfFile(entry.source.file, signal)) === stored.sha256) reused.set(entry, stored.id);
    } catch {
      if (signal.aborted) break;
    }
    onProgress({ checked: index + 1, total: pairs.length });
  }
  return reused;
}
