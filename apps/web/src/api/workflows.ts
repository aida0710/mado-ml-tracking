import { jsonRequestInit, requestJson } from '@mado/design-system/http';
import type { WorkflowCreate, WorkflowLaunch, WorkflowVersionCreate } from '@mmt/contracts';
import {
  itemsOf,
  workflowDetailSchema,
  workflowExecutionPageSchema,
  workflowExecutionSchema,
  workflowSchema,
  workflowVersionPageSchema,
  workflowVersionSchema,
} from '@mmt/contracts/schemas';
import { encodeId, projectPath } from './http';

const workflowPath = (projectId: string, workflowId: string) =>
  `${projectPath(projectId)}/workflows/${encodeId(workflowId)}`;
const executionPath = (projectId: string, executionId: string) =>
  `${projectPath(projectId)}/workflow-executions/${encodeId(executionId)}`;
const cursorQuery = (cursor: string | undefined) =>
  cursor ? `?${new URLSearchParams({ cursor })}` : '';

export const workflowsApi = {
  list: async (projectId: string, signal?: AbortSignal) =>
    (await requestJson(`${projectPath(projectId)}/workflows`, { schema: itemsOf(workflowSchema), init: { signal } }))
      .items,
  /** ワークフローと、その新しいほうのバージョン。残りは`olderVersionsCursor`でたどる。 */
  get: (projectId: string, id: string, signal?: AbortSignal) =>
    requestJson(workflowPath(projectId, id), { schema: workflowDetailSchema, init: { signal } }),
  olderVersions: (projectId: string, id: string, cursor: string) =>
    requestJson(`${workflowPath(projectId, id)}/versions${cursorQuery(cursor)}`, { schema: workflowVersionPageSchema }),
  create: (projectId: string, input: WorkflowCreate) =>
    requestJson(`${projectPath(projectId)}/workflows`, {
      schema: workflowDetailSchema,
      init: jsonRequestInit('POST', input),
    }),
  createVersion: (projectId: string, id: string, input: WorkflowVersionCreate) =>
    requestJson(`${workflowPath(projectId, id)}/versions`, {
      schema: workflowVersionSchema,
      init: jsonRequestInit('POST', input),
    }),
  launch: (projectId: string, id: string, input: WorkflowLaunch) =>
    requestJson(`${workflowPath(projectId, id)}/launch`, {
      schema: workflowExecutionSchema,
      init: jsonRequestInit('POST', input),
    }),
  history: (projectId: string, id: string, { cursor, signal }: { cursor?: string; signal?: AbortSignal } = {}) =>
    requestJson(`${workflowPath(projectId, id)}/executions${cursorQuery(cursor)}`, {
      schema: workflowExecutionPageSchema,
      init: { signal },
    }),
  execution: (projectId: string, id: string, signal?: AbortSignal) =>
    requestJson(executionPath(projectId, id), { schema: workflowExecutionSchema, init: { signal } }),
  cancel: (projectId: string, id: string) =>
    requestJson(`${executionPath(projectId, id)}/cancel`, {
      schema: workflowExecutionSchema,
      init: jsonRequestInit('POST', {}),
    }),
};
