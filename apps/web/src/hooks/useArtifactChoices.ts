import type { Artifact } from '@mmt/contracts';
import { trackingApi } from '../api/tracking';
import { parseArtifactReference } from '../lib/artifactReference';
import { useProjectArtifacts } from './useProjectArtifacts';
import { useQuery } from './useQuery';
import { useSettledValue } from './useSettledValue';

// A path search starts once typing pauses, so each keystroke does not list the Artifacts again.
export const ARTIFACT_SEARCH_DELAY_MS = 300;

/**
 * The Artifacts a picker offers for what is typed in it. A pasted id or `artifact://<id>` is
 * looked up directly (`referenced`, with `referenceMissing` when the Project has no such Artifact);
 * anything else searches saved paths, within `runId`'s files when a Run is given.
 */
export function useArtifactChoices({
  projectId,
  runId,
  input,
}: {
  projectId: string;
  runId?: string;
  input: string;
}) {
  const referenceId = parseArtifactReference(input);
  const { settled: search, isSettling } = useSettledValue(
    referenceId ? '' : input.trim(),
    ARTIFACT_SEARCH_DELAY_MS,
  );
  const listing = useProjectArtifacts({ projectId, enabled: !referenceId, search, runId });
  const referenced = useQuery<Artifact | null>(
    referenceId ? `${projectId}:artifact:${referenceId}` : null,
    (signal) => trackingApi.findArtifact(projectId, referenceId!, signal),
  );
  if (referenceId)
    return {
      referenceId,
      artifacts: referenced.value ? [referenced.value] : [],
      loading: referenced.loading,
      referenceMissing: referenced.value === null,
      error: referenced.error,
      hasSearch: true,
      reload: referenced.reload,
    };
  return {
    referenceId: null,
    artifacts: isSettling ? [] : listing.items,
    loading: isSettling || listing.loading,
    referenceMissing: false,
    error: listing.error,
    hasSearch: search !== '',
    reload: listing.reload,
  };
}
