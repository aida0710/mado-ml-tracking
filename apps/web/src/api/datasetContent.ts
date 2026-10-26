import { requestJson } from '@mado/design-system/http';
import { artifactTreeSchema, datasetVersionFilePageSchema } from '@mmt/contracts/schemas';
import { encodeId, projectPath } from './http';

const versionPath = (location: DatasetVersionLocation) =>
  `${projectPath(location.projectId)}/datasets/${encodeId(location.datasetId)}/versions/${encodeId(location.versionId)}`;

export interface DatasetVersionLocation {
  projectId: string;
  datasetId: string;
  versionId: string;
}

export const datasetContentApi = {
  /** `prefix`（`/`で終わるディレクトリ。ルートは''）の直下のファイルを、パスの順に返す。 */
  directoryFiles: (
    location: DatasetVersionLocation,
    page: { prefix: string; limit: number; cursor?: string },
    signal?: AbortSignal,
  ) => {
    const query = new URLSearchParams({ prefix: page.prefix, delimiter: '/', limit: String(page.limit) });
    if (page.cursor) query.set('cursor', page.cursor);
    return requestJson(`${versionPath(location)}/files?${query}`, {
      schema: datasetVersionFilePageSchema,
      init: { signal },
    });
  },
  fileTree: (location: DatasetVersionLocation, prefix: string, signal?: AbortSignal) =>
    requestJson(`${versionPath(location)}/files/tree?${new URLSearchParams({ prefix })}`, {
      schema: artifactTreeSchema,
      init: { signal },
    }),
};
