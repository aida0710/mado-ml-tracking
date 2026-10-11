import type {
  Workflow,
  WorkflowCreate,
  WorkflowDetail,
  WorkflowExecution,
  WorkflowExecutionPage,
  WorkflowLaunch,
  WorkflowVersion,
  WorkflowVersionCreate,
  RunDatasetUsage,
  PreprocessingReportResponse,
  PreprocessingReport,
  PreprocessingReportInput,
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
const runPath = (projectId: string, runId: string) =>
  `${projectPath(projectId)}/runs/${encodeId(runId)}`;

export const workflowsApi = {
  list: (projectId: string, signal?: AbortSignal) =>
    requestItems<Workflow>(`${projectPath(projectId)}/workflows`, signal),
  get: (projectId: string, id: string, signal?: AbortSignal) =>
    request<WorkflowDetail>(workflowPath(projectId, id), { signal }),
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
    const query = cursor ? `?${new URLSearchParams({ cursor })}` : '';
    const page = await request<WorkflowExecutionPage>(
      `${workflowPath(projectId, id)}/executions${query}`,
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

export const preprocessingApi = {
  report: async (projectId: string, runId: string, signal?: AbortSignal) =>
    (
      await request<PreprocessingReportResponse>(
        `${runPath(projectId, runId)}/preprocessing-report`,
        { signal },
      )
    ).report,
  saveReport: (projectId: string, runId: string, report: PreprocessingReportInput) =>
    request<PreprocessingReport>(
      `${runPath(projectId, runId)}/preprocessing-report`,
      jsonRequest('PUT', report),
    ),
  usage: async (projectId: string, runId: string, signal?: AbortSignal) =>
    (await request<RunDatasetUsage>(`${runPath(projectId, runId)}/dataset-usage`, { signal }))
      .items,
};
