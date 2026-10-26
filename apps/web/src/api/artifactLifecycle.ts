import { requestJson } from '@mado/design-system/http';
import { artifactReferencesSchema, artifactSchema, artifactUsageSchema, itemsOf } from '@mmt/contracts/schemas';
import { encodeId, projectPath } from './http';

export const artifactLifecycleApi = {
  /** Project adminだけ。実体のファイルは、サーバーの猶予期間が過ぎてから消える。 */
  delete: (projectId: string, artifactId: string) =>
    requestJson(`${projectPath(projectId)}/artifacts/${encodeId(artifactId)}`, {
      schema: artifactSchema,
      init: { method: 'DELETE' },
    }),
  /** 各Artifactを使っている場所。1回に渡せるIDはARTIFACT_REFERENCES_BATCH_LIMIT個まで。 */
  references: async (projectId: string, artifactIds: readonly string[], signal?: AbortSignal) =>
    (
      await requestJson(
        `${projectPath(projectId)}/artifact-references?artifactIds=${artifactIds.map(encodeId).join(',')}`,
        { schema: itemsOf(artifactReferencesSchema), init: { signal } },
      )
    ).items,
  usage: (projectId: string, signal?: AbortSignal) =>
    requestJson(`${projectPath(projectId)}/artifact-usage`, { schema: artifactUsageSchema, init: { signal } }),
};
