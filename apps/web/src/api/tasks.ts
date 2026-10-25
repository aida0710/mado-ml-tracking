import type { ExperimentTask, RunOutputRegistration, TaskExecution, TaskRunPage } from '@mmt/contracts';
import type { CreateTask, LaunchTask, UpdateTask } from './inputs';
import { encodeId, invalidResponseError, isNotFoundError, jsonRequest, projectPath, request, requestItems } from './http';

const REGISTRATION_STATUSES: RunOutputRegistration['status'][] = ['registered', 'failed', 'skipped'];

// Taskの履歴全体をポーリングせず、上限のあるAPIの既定値に合わせる。
const TASK_RUN_PAGE_SIZE = 50;

const taskPath = (projectId: string, id?: string) =>
  `${projectPath(projectId)}/tasks${id ? `/${encodeId(id)}` : ''}`;

export const tasksApi = {
  list: (projectId: string, experimentId?: string, signal?: AbortSignal) =>
    requestItems<ExperimentTask>(
      `${taskPath(projectId)}${experimentId ? `?${new URLSearchParams({ experimentId })}` : ''}`,
      signal,
    ),
  create: (projectId: string, input: CreateTask) =>
    request<ExperimentTask>(taskPath(projectId), jsonRequest('POST', input)),
  update: (projectId: string, id: string, input: UpdateTask) =>
    request<ExperimentTask>(taskPath(projectId, id), jsonRequest('PATCH', input)),
  launch: (projectId: string, id: string, input: LaunchTask) =>
    request<TaskExecution>(`${taskPath(projectId, id)}/launch`, jsonRequest('POST', input)),
  runs: async (projectId: string, id: string, { cursor, signal }: { cursor?: string; signal?: AbortSignal } = {}) => {
    const query = new URLSearchParams({ limit: String(TASK_RUN_PAGE_SIZE) });
    if (cursor) query.set('cursor', cursor);
    const page = await request<TaskRunPage>(`${taskPath(projectId, id)}/runs?${query}`, { signal });
    if (!Array.isArray(page.items) || (page.nextCursor !== null && typeof page.nextCursor !== 'string'))
      throw invalidResponseError();
    return page;
  },
  /** Task側の登録の結果が出るまではnull。それまでAPIは404を返す。 */
  runOutputRegistration: async (projectId: string, runId: string, signal?: AbortSignal) => {
    try {
      const registration = await request<RunOutputRegistration | undefined>(
        `${projectPath(projectId)}/runs/${encodeId(runId)}/output-registration`, { signal });
      if (registration && !REGISTRATION_STATUSES.includes(registration.status)) throw invalidResponseError();
      return registration ?? null;
    } catch (error) {
      if (isNotFoundError(error)) return null;
      throw error;
    }
  },
};
