import { isNotFoundError, jsonRequestInit, requestJson } from '@mado/design-system/http';
import {
  experimentTaskSchema,
  itemsOf,
  runOutputRegistrationSchema,
  taskExecutionSchema,
  taskRunPageSchema,
} from '@mmt/contracts/schemas';
import type { CreateTask, LaunchTask, UpdateTask } from './inputs';
import { encodeId, projectPath } from './http';

// Taskの履歴全体をポーリングせず、上限のあるAPIの既定値に合わせる。
const TASK_RUN_PAGE_SIZE = 50;

const taskPath = (projectId: string, id?: string) =>
  `${projectPath(projectId)}/tasks${id ? `/${encodeId(id)}` : ''}`;

export const tasksApi = {
  list: async (projectId: string, experimentId?: string, signal?: AbortSignal) =>
    (
      await requestJson(`${taskPath(projectId)}${experimentId ? `?${new URLSearchParams({ experimentId })}` : ''}`, {
        schema: itemsOf(experimentTaskSchema),
        init: { signal },
      })
    ).items,
  create: (projectId: string, input: CreateTask) =>
    requestJson(taskPath(projectId), { schema: experimentTaskSchema, init: jsonRequestInit('POST', input) }),
  update: (projectId: string, id: string, input: UpdateTask) =>
    requestJson(taskPath(projectId, id), { schema: experimentTaskSchema, init: jsonRequestInit('PATCH', input) }),
  launch: (projectId: string, id: string, input: LaunchTask) =>
    requestJson(`${taskPath(projectId, id)}/launch`, { schema: taskExecutionSchema, init: jsonRequestInit('POST', input) }),
  runs: (projectId: string, id: string, { cursor, signal }: { cursor?: string; signal?: AbortSignal } = {}) => {
    const query = new URLSearchParams({ limit: String(TASK_RUN_PAGE_SIZE) });
    if (cursor) query.set('cursor', cursor);
    return requestJson(`${taskPath(projectId, id)}/runs?${query}`, { schema: taskRunPageSchema, init: { signal } });
  },
  /** Task側の登録の結果が出るまではnull。それまでAPIは404を返す。 */
  runOutputRegistration: async (projectId: string, runId: string, signal?: AbortSignal) => {
    try {
      return await requestJson(`${projectPath(projectId)}/runs/${encodeId(runId)}/output-registration`, {
        schema: runOutputRegistrationSchema,
        init: { signal },
      });
    } catch (error) {
      if (isNotFoundError(error)) return null;
      throw error;
    }
  },
};
