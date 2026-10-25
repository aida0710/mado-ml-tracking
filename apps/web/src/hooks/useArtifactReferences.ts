import { useState } from 'react';
import { ARTIFACT_REFERENCES_BATCH_LIMIT, type ArtifactReferences } from '@mmt/contracts';
import { artifactLifecycleApi } from '../api/artifactLifecycle';
import { useQuery } from './useQuery';

/** What was fetched for a Project: every ID asked about, and the references of the known ones. */
interface CheckedReferences {
  projectId: string;
  checkedIds: ReadonlySet<string>;
  byArtifactId: ReadonlyMap<string, ArtifactReferences>;
}

const noCheckedReferences = (projectId: string): CheckedReferences => ({
  projectId,
  checkedIds: new Set(),
  byArtifactId: new Map(),
});

/**
 * Where each of the given Artifacts is used, by Artifact ID. What was fetched is kept, so a list
 * that grows (the catalog's next page) asks only about its new IDs, in requests of
 * ARTIFACT_REFERENCES_BATCH_LIMIT, and the rows already shown keep their references meanwhile.
 */
export function useArtifactReferences(projectId: string, artifactIds: readonly string[]) {
  const [state, setState] = useState(() => noCheckedReferences(projectId));
  const checked = state.projectId === projectId ? state : noCheckedReferences(projectId);
  const uncheckedIds = [...new Set(artifactIds)].filter((id) => !checked.checkedIds.has(id));
  const key = uncheckedIds.length ? `${projectId}:artifact-references:${uncheckedIds.join(',')}` : null;
  const query = useQuery(key, async (signal) => {
    const batches: string[][] = [];
    for (let start = 0; start < uncheckedIds.length; start += ARTIFACT_REFERENCES_BATCH_LIMIT)
      batches.push(uncheckedIds.slice(start, start + ARTIFACT_REFERENCES_BATCH_LIMIT));
    const pages = await Promise.all(
      batches.map((batch) => artifactLifecycleApi.references(projectId, batch, signal)),
    );
    // The API leaves out IDs it does not know; they count as asked, so they are not asked again.
    return { askedIds: uncheckedIds, items: pages.flat() };
  });

  // Each answer is merged once, during the render that first sees it.
  const fetched = query.value;
  const [mergedAnswer, setMergedAnswer] = useState<typeof fetched>(undefined);
  if (fetched && fetched !== mergedAnswer) {
    setMergedAnswer(fetched);
    setState((previous) => {
      const kept = previous.projectId === projectId ? previous : noCheckedReferences(projectId);
      return {
        projectId,
        checkedIds: new Set([...kept.checkedIds, ...fetched.askedIds]),
        byArtifactId: new Map([
          ...kept.byArtifactId,
          ...fetched.items.map((references) => [references.artifactId, references] as const),
        ]),
      };
    });
  }

  return {
    byArtifactId: checked.byArtifactId,
    /** Whether the Artifact's references are known; false while they load or after a failure. */
    isChecked: (artifactId: string) => checked.checkedIds.has(artifactId),
    error: query.error,
    /** Forgets what was fetched and asks about every ID again. */
    reload: () => {
      setState(noCheckedReferences(projectId));
      query.reload();
    },
  };
}

/** Whether anything keeps the Artifact, so deleting it would be refused. */
export function hasArtifactReferences(references: ArtifactReferences): boolean {
  return (
    references.modelVersions.length +
      references.datasetVersions.length +
      references.codeVersions.length +
      references.checkpoints.length +
      (references.preprocessingReports?.length ?? 0) >
    0
  );
}
