import type { Artifact, ArtifactReferences, ArtifactUsage } from '@mmt/contracts';
import { encodeId, projectPath, request, requestItems } from './http';

export const artifactLifecycleApi = {
  /** Project admins only; the blob is removed after the server's grace period. */
  delete: (projectId: string, artifactId: string): Promise<Artifact> =>
    request<Artifact>(`${projectPath(projectId)}/artifacts/${encodeId(artifactId)}`, {
      method: 'DELETE',
    }),
  /** Where each Artifact is used; up to ARTIFACT_REFERENCES_BATCH_LIMIT IDs per call. */
  references: (projectId: string, artifactIds: readonly string[], signal?: AbortSignal) =>
    requestItems<ArtifactReferences>(
      `${projectPath(projectId)}/artifact-references?artifactIds=${artifactIds.map(encodeId).join(',')}`,
      signal,
    ),
  usage: (projectId: string, signal?: AbortSignal): Promise<ArtifactUsage> =>
    request<ArtifactUsage>(`${projectPath(projectId)}/artifact-usage`, { signal }),
};
