import type { RunNote, RunNoteUpdate } from '@mmt/contracts';
import { encodeId, jsonRequest, projectPath, request } from './http';

// Runの説明はRunのmlflow.note.contentタグにある。このエンドポイントはそれだけを書く。
export const runNotesApi = {
  update: (projectId: string, runId: string, body: RunNoteUpdate) =>
    request<RunNote>(
      `${projectPath(projectId)}/runs/${encodeId(runId)}/note`,
      jsonRequest('PUT', body),
    ),
};
