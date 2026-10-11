import { useState } from 'react';
import type { Artifact } from '@mmt/contracts';
import { trackingApi } from '../api/tracking';
import { useCursorPages } from './useCursorPages';
import { useQuery } from './useQuery';
import { ARTIFACT_LIST_LIMIT } from '../lib/artifactCatalog';

/**
 * The Project's Artifacts whose saved path contains `search`, newest first, for a field that picks
 * one. With `runId`, only that Run's files as its Artifacts tab shows them (the latest per path).
 * `rememberArtifact` keeps a chosen Artifact listed after the search changes.
 */
export function useProjectArtifacts({
  projectId,
  enabled,
  search,
  runId,
}: {
  projectId: string;
  enabled: boolean;
  search: string;
  runId?: string;
}) {
  const query = useQuery(
    enabled ? `${projectId}:project-artifacts:${runId ?? ''}:${search}` : null,
    (signal) =>
      trackingApi.projectArtifacts(
        projectId,
        {
          limit: ARTIFACT_LIST_LIMIT,
          query: search,
          ...(runId ? { runId, versions: 'latest' as const } : {}),
        },
        signal,
      ),
  );
  const [selectedArtifacts, setSelectedArtifacts] = useState<Artifact[]>([]);
  const items = [
    ...new Map(
      [...(query.value ?? []), ...selectedArtifacts].map((artifact) => [artifact.id, artifact]),
    ).values(),
  ];
  function rememberArtifact(artifact: Artifact) {
    setSelectedArtifacts((previous) => [
      ...previous.filter((item) => item.id !== artifact.id),
      artifact,
    ]);
  }
  return { ...query, items, rememberArtifact };
}

export interface ProjectArtifactFilter {
  query: string;
  /** `type/*`, or '' for every type. */
  mimeType: string;
  runId: string;
  /** '' with modelVersionId '' for every Artifact; a Model alone covers all of its versions. */
  modelId: string;
  modelVersionId: string;
  includePreviousVersions: boolean;
}

// The catalog API allows up to 500; a smaller page keeps the first screen quick.
const PROJECT_ARTIFACT_PAGE_SIZE = 100;

/** The Project-wide Artifact catalog, newest first, read page by page. */
export function useProjectArtifactCatalog(projectId: string, filter: ProjectArtifactFilter) {
  return useCursorPages(
    `${projectId}:artifact-catalog:${JSON.stringify(filter)}`,
    (cursor, signal) =>
      trackingApi.projectArtifactPage(
        projectId,
        {
          limit: PROJECT_ARTIFACT_PAGE_SIZE,
          query: filter.query || undefined,
          mimeType: filter.mimeType || undefined,
          runId: filter.runId || undefined,
          modelId: filter.modelId || undefined,
          modelVersionId: filter.modelVersionId || undefined,
          versions: filter.includePreviousVersions ? 'all' : 'latest',
          cursor,
        },
        signal,
      ),
  );
}
