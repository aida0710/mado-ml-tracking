import { isNotFoundError, requestJson } from '@mado/design-system/http';
import { ARTIFACT_MEDIA_INFO_BATCH_LIMIT, type ArtifactMediaInfo } from '@mmt/contracts';
import { artifactMediaInfoSchema, itemsOf } from '@mmt/contracts/schemas';
import { encodeId, projectPath } from './http';

function chunksOf<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let start = 0; start < items.length; start += size) chunks.push(items.slice(start, start + size));
  return chunks;
}

export const artifactMediaInfoApi = {
  /** サーバーにmedia情報が無いとき（ヘッダーを読まない形式など）はnull。 */
  get: async (projectId: string, artifactId: string, signal?: AbortSignal): Promise<ArtifactMediaInfo | null> => {
    try {
      return await requestJson(`${projectPath(projectId)}/artifacts/${encodeId(artifactId)}/media-info`, {
        schema: artifactMediaInfoSchema,
        init: { signal },
      });
    } catch (error) {
      if (isNotFoundError(error)) return null;
      throw error;
    }
  },
  /** 大きな一覧はAPIが受け付ける大きさの要求に分ける。media情報の無いArtifactは結果に無い。 */
  list: async (projectId: string, artifactIds: string[], signal?: AbortSignal): Promise<ArtifactMediaInfo[]> => {
    const pages = await Promise.all(
      chunksOf([...new Set(artifactIds)], ARTIFACT_MEDIA_INFO_BATCH_LIMIT).map((chunk) =>
        requestJson(`${projectPath(projectId)}/artifact-media-info?artifactIds=${chunk.map(encodeId).join(',')}`, {
          schema: itemsOf(artifactMediaInfoSchema),
          init: { signal },
        }),
      ),
    );
    return pages.flatMap((page) => page.items);
  },
};
