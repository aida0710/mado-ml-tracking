import { jsonRequestInit, requestJson } from '@mado/design-system/http';
import type { RunNoteUpdate } from '@mmt/contracts';
import { runNoteSchema } from '@mmt/contracts/schemas';
import { encodeId, projectPath } from './http';

// Runの説明はRunのmlflow.note.contentタグにある。このエンドポイントはそれだけを書く。
export const runNotesApi = {
  update: (projectId: string, runId: string, body: RunNoteUpdate) =>
    requestJson(`${projectPath(projectId)}/runs/${encodeId(runId)}/note`, {
      schema: runNoteSchema,
      init: jsonRequestInit('PUT', body),
    }),
};
