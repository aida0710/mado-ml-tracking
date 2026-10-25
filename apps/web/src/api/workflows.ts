import type {
  Workflow,
  WorkflowCreate,
  WorkflowDetail,
  WorkflowExecution,
  WorkflowExecutionPage,
  WorkflowLaunch,
  WorkflowVersion,
  WorkflowVersionCreate,
  WorkflowVersionPage,
} from '@mmt/contracts';
import {
  assertCursorPage,
  encodeId,
  jsonRequest,
  projectPath,
  request,
  requestItems,
} from './http';

const workflowPath = (projectId: string, workflowId: string) =>
  `${projectPath(projectId)}/workflows/${encodeId(workflowId)}`;
const executionPath = (projectId: string, executionId: string) =>
  `${projectPath(projectId)}/workflow-executions/${encodeId(executionId)}`;
const cursorQuery = (cursor: string | undefined) =>
  cursor ? `?${new URLSearchParams({ cursor })}` : '';

export const workflowsApi = {
  list: (projectId: string, signal?: AbortSignal) =>
    requestItems<Workflow>(`${projectPath(projectId)}/workflows`, signal),
  /** ワークフローと、その新しいほうのバージョン。残りは`olderVersionsCursor`でたどる。 */
  get: (projectId: string, id: string, signal?: AbortSignal) =>
    request<WorkflowDetail>(workflowPath(projectId, id), { signal }),
  olderVersions: async (projectId: string, id: string, cursor: string) => {
    const page = await request<WorkflowVersionPage>(
      `${workflowPath(projectId, id)}/versions${cursorQuery(cursor)}`,
    );
    assertCursorPage(page);
    return page;
  },
  create: (projectId: string, input: WorkflowCreate) =>
    request<WorkflowDetail>(`${projectPath(projectId)}/workflows`, jsonRequest('POST', input)),
  createVersion: (projectId: string, id: string, input: WorkflowVersionCreate) =>
    request<WorkflowVersion>(`${workflowPath(projectId, id)}/versions`, jsonRequest('POST', input)),
  launch: (projectId: string, id: string, input: WorkflowLaunch) =>
    request<WorkflowExecution>(`${workflowPath(projectId, id)}/launch`, jsonRequest('POST', input)),
  history: async (
    projectId: string,
    id: string,
    { cursor, signal }: { cursor?: string; signal?: AbortSignal } = {},
  ) => {
    const page = await request<WorkflowExecutionPage>(
      `${workflowPath(projectId, id)}/executions${cursorQuery(cursor)}`,
      { signal },
    );
    assertCursorPage(page);
    return page;
  },
  execution: (projectId: string, id: string, signal?: AbortSignal) =>
    request<WorkflowExecution>(executionPath(projectId, id), { signal }),
  cancel: (projectId: string, id: string) =>
    request<WorkflowExecution>(`${executionPath(projectId, id)}/cancel`, jsonRequest('POST', {})),
};
