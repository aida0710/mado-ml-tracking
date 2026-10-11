import { useEffect, useState } from 'react';
import type { Artifact } from '@mmt/contracts';
import { trackingApi } from '../api/tracking';
import { sha256OfFile } from '../lib/fileSha256';
import { useSettledValue } from './useSettledValue';

// Waits for a pause in typing the path before asking the API.
const PATH_SETTLE_MS = 400;
// A few matches are enough: the path is searched as text and the exact one is picked out.
const PATH_MATCH_LIMIT = 20;
/** Larger files are not hashed just to say "the same content"; the warning stands without it. */
const SAME_CONTENT_CHECK_MAX_BYTES = 64 * 1024 * 1024;

/** What is already stored at the path the chosen file is about to take. */
export interface ArtifactAtPath {
  existing: Artifact;
  /** null when the content was not compared (different size, or too large to hash quickly). */
  isSameContent: boolean | null;
}

/**
 * The latest Artifact stored at `path` in the Run (or among Runless files), so the dialog can say
 * that uploading adds a new version there, and whether the chosen file has the same bytes.
 */
export function useArtifactAtPath({
  projectId,
  runId,
  path,
  file,
}: {
  projectId: string;
  runId: string | null;
  path: string;
  file: File | null;
}): ArtifactAtPath | null {
  const { settled } = useSettledValue(path, PATH_SETTLE_MS);
  const [found, setFound] = useState<ArtifactAtPath | null>(null);
  useEffect(() => {
    setFound(null);
    if (!file || settled === '') return;
    const controller = new AbortController();
    void (async () => {
      const candidates = await trackingApi.projectArtifacts(
        projectId,
        { limit: PATH_MATCH_LIMIT, query: settled, versions: 'latest', ...(runId ? { runId } : {}) },
        controller.signal,
      );
      const existing = candidates.find((artifact) => artifact.path === settled && artifact.runId === runId);
      if (!existing || controller.signal.aborted) return;
      setFound({ existing, isSameContent: null });
      if (existing.size !== file.size) {
        setFound({ existing, isSameContent: false });
        return;
      }
      if (file.size > SAME_CONTENT_CHECK_MAX_BYTES) return;
      const digest = await sha256OfFile(file, controller.signal);
      if (!controller.signal.aborted) setFound({ existing, isSameContent: digest === existing.sha256 });
      // Without an answer the dialog only goes without the warning; the upload itself is unaffected.
    })().catch(() => undefined);
    return () => controller.abort();
  }, [file, projectId, runId, settled]);
  return found;
}
