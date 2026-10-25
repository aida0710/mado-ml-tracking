import type { Artifact, ArtifactReferences, ArtifactUsage } from '@mmt/contracts';
import { encodeId, projectPath, request, requestItems } from './http';

export const artifactLifecycleApi = {
  /** Project adminだけ。実体のファイルは、サーバーの猶予期間が過ぎてから消える。 */
  delete: (projectId: string, artifactId: string): Promise<Artifact> =>
    request<Artifact>(`${projectPath(projectId)}/artifacts/${encodeId(artifactId)}`, {
      method: 'DELETE',
    }),
  /** 各Artifactを使っている場所。1回に渡せるIDはARTIFACT_REFERENCES_BATCH_LIMIT個まで。 */
  references: (projectId: string, artifactIds: readonly string[], signal?: AbortSignal) =>
    requestItems<ArtifactReferences>(
      `${projectPath(projectId)}/artifact-references?artifactIds=${artifactIds.map(encodeId).join(',')}`,
      signal,
    ),
  usage: (projectId: string, signal?: AbortSignal): Promise<ArtifactUsage> =>
    request<ArtifactUsage>(`${projectPath(projectId)}/artifact-usage`, { signal }),
};
