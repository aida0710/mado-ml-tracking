import type {
  Hook,
  HookCreate,
  HookCreated,
  HookExecution,
  HookExecutionPage,
  HookOwnerTransfer,
  HookToggle,
  HookTriggerRequest,
} from '@mmt/contracts';
import {
  assertCursorPage,
  encodeId,
  invalidResponseError,
  jsonRequest,
  projectPath,
  request,
  requestItems,
} from './http';

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

async function createHook(projectId: string, body: HookCreate): Promise<HookCreated> {
  const created = await request<HookCreated>(hooksPath(projectId), jsonRequest('POST', body));
  // 秘密鍵は一度しか見せないので、フックの無い応答は表示も安全な送り直しもできない。
  if (typeof created.hook?.id !== 'string') throw invalidResponseError(201);
  return created;
}

/** Projectのフックの実行を、新しい順にcursorのページ単位で読む。 */
async function listExecutions(
  projectId: string,
  query: HookExecutionQuery,
  signal?: AbortSignal,
): Promise<HookExecutionPage> {
  const search = new URLSearchParams({ limit: String(query.limit ?? HOOK_EXECUTION_PAGE_SIZE) });
  if (query.hookId) search.set('hookId', query.hookId);
  if (query.cursor) search.set('cursor', query.cursor);
  const page = await request<HookExecutionPage>(
    `${projectPath(projectId)}/hook-executions?${search}`,
    { signal },
  );
  assertCursorPage(page);
  return page;
}

export const hooksApi = {
  list: (projectId: string, signal?: AbortSignal) =>
    requestItems<Hook>(hooksPath(projectId), signal),
  /** 'webhook'のフックの署名の秘密鍵とパスは、この応答でだけ返る。 */
  create: createHook,
  setEnabled: (projectId: string, hookId: string, enabled: boolean) =>
    request<Hook>(
      hooksPath(projectId, hookId),
      jsonRequest('PATCH', { enabled } satisfies HookToggle),
    ),
  /** 以後、フックをProjectのService Accountとして動かす。Project adminだけ。 */
  transferOwner: (projectId: string, hookId: string, body: HookOwnerTransfer) =>
    request<Hook>(`${hooksPath(projectId, hookId)}/owner`, jsonRequest('PUT', body)),
  /** 'manual'のフックを起動する。同じidempotencyKeyで送り直すと、最初の起動を返す。 */
  trigger: (projectId: string, hookId: string, body: HookTriggerRequest) =>
    request<HookExecution>(`${hooksPath(projectId, hookId)}/trigger`, jsonRequest('POST', body)),
  executions: listExecutions,
};
