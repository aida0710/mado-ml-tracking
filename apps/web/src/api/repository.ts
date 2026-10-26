import { jsonRequestInit, requestJson } from '@mado/design-system/http';
import { repositoryFilesSchema } from '@mmt/contracts/schemas';
import { projectPath } from './http';

export const repositoryApi = {
  files: (projectId: string, source: { url: string; commit: string }, signal?: AbortSignal) =>
    requestJson(`${projectPath(projectId)}/repository-files`, {
      schema: repositoryFilesSchema,
      init: { ...jsonRequestInit('POST', source), signal },
    }),
};
