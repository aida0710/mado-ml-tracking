import { jsonRequestInit, requestJson } from '@mado/design-system/http';
import type { HookCreate, HookOwnerTransfer, HookToggle, HookTriggerRequest } from '@mmt/contracts';
import {
  hookCreatedSchema,
  hookExecutionPageSchema,
  hookExecutionSchema,
  hookSchema,
  itemsOf,
} from '@mmt/contracts/schemas';
import { encodeId, projectPath } from './http';

// 実行の表の1ページの件数。ページの大きさの上限はAPI側で決まる。
export const HOOK_EXECUTION_PAGE_SIZE = 50;

const hooksPath = (projectId: string, hookId?: string) =>
  `${projectPath(projectId)}/hooks${hookId ? `/${encodeId(hookId)}` : ''}`;

export interface HookExecutionQuery {
  /** このフックの実行だけ。省くとProjectのすべてのフックの実行。 */
  hookId?: string;
  cursor?: string;
  limit?: number;
}

/** Projectのフックの実行を、新しい順にcursorのページ単位で読む。 */
function listExecutions(projectId: string, query: HookExecutionQuery, signal?: AbortSignal) {
  const search = new URLSearchParams({ limit: String(query.limit ?? HOOK_EXECUTION_PAGE_SIZE) });
  if (query.hookId) search.set('hookId', query.hookId);
  if (query.cursor) search.set('cursor', query.cursor);
  return requestJson(`${projectPath(projectId)}/hook-executions?${search}`, {
    schema: hookExecutionPageSchema,
    init: { signal },
  });
}

export const hooksApi = {
  list: async (projectId: string, signal?: AbortSignal) =>
    (await requestJson(hooksPath(projectId), { schema: itemsOf(hookSchema), init: { signal } })).items,
  /** 'webhook'のフックの署名の秘密鍵とパスは、この応答でだけ返る。 */
  create: (projectId: string, body: HookCreate) =>
    requestJson(hooksPath(projectId), { schema: hookCreatedSchema, init: jsonRequestInit('POST', body) }),
  setEnabled: (projectId: string, hookId: string, enabled: boolean) =>
    requestJson(hooksPath(projectId, hookId), {
      schema: hookSchema,
      init: jsonRequestInit('PATCH', { enabled } satisfies HookToggle),
    }),
  /** 以後、フックをProjectのService Accountとして動かす。Project adminだけ。 */
  transferOwner: (projectId: string, hookId: string, body: HookOwnerTransfer) =>
    requestJson(`${hooksPath(projectId, hookId)}/owner`, { schema: hookSchema, init: jsonRequestInit('PUT', body) }),
  /** 'manual'のフックを起動する。同じidempotencyKeyで送り直すと、最初の起動を返す。 */
  trigger: (projectId: string, hookId: string, body: HookTriggerRequest) =>
    requestJson(`${hooksPath(projectId, hookId)}/trigger`, {
      schema: hookExecutionSchema,
      init: jsonRequestInit('POST', body),
    }),
  executions: listExecutions,
};
