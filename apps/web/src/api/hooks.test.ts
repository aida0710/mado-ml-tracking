import { ApiError } from '@mado/design-system/http';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Hook, HookCreated, HookExecution } from '@mmt/contracts';
import { HOOK_EXECUTION_PAGE_SIZE, hooksApi } from './hooks';

const PROJECT_ID = '00000000-0000-4000-8000-000000000001';
const USER_ID = '00000000-0000-4000-8000-000000000002';
const SERVICE_ACCOUNT_ID = '00000000-0000-4000-8000-000000000003';
const HOOK_ID = '00000000-0000-4000-8000-000000000040';
const createdAt = '2026-10-08T00:00:00.000Z';
const webhook = {
  id: HOOK_ID,
  projectId: PROJECT_ID,
  name: 'Webhook',
  enabled: true,
  trigger: 'webhook',
  filter: {},
  template: {
    experimentId: '00000000-0000-4000-8000-000000000041',
    kind: 'inference',
    codeVersionId: '00000000-0000-4000-8000-000000000042',
    modelVersionId: null,
    inheritModelVersion: false,
    inputDatasetVersionIds: [],
    inheritOutputDatasets: false,
    parameters: {},
    tags: {},
    targetId: '00000000-0000-4000-8000-000000000043',
    gpuIds: [],
    gpuCount: 0,
    walltimeSeconds: null,
    arraySize: null,
    datasetPartitionVersionId: null,
    maxAttempts: 1,
    retryOnFailure: false,
    retryOnTimeout: false,
    allowChildJobs: false,
  },
  checkpointMode: 'every',
  checkpointEvery: null,
  concurrency: 'queue',
  maxStartsPerHour: 60,
  webhookSignature: 'github',
  createdBy: USER_ID,
  runAsUserId: USER_ID,
  createdByName: '検証担当',
  createdAt,
} satisfies Hook;
const queuedExecution = {
  id: '00000000-0000-4000-8000-000000000044',
  projectId: PROJECT_ID,
  hookId: HOOK_ID,
  status: 'queued',
  subjectKind: 'manual',
  subjectId: null,
  reason: null,
  error: null,
  jobId: null,
  arrayGroupId: null,
  runId: null,
  waitingRunId: null,
  checkpointId: null,
  requestedBy: USER_ID,
  jobStatus: null,
  createdAt,
  updatedAt: createdAt,
} satisfies HookExecution;

afterEach(() => vi.unstubAllGlobals());
function stubJsonResponse(body: unknown, status = 200) {
  // Responseの本文は1回しか読めないので、呼ぶたびに別のResponseを作る。
  const fetch = vi
    .fn()
    .mockImplementation(() => Promise.resolve(new Response(JSON.stringify(body), { status })));
  vi.stubGlobal('fetch', fetch);
  return fetch;
}
const sentBody = (fetch: ReturnType<typeof stubJsonResponse>) =>
  JSON.parse(fetch.mock.calls[0]?.[1].body as string) as unknown;

describe('フックのAPI呼び出し', () => {
  it('一覧はProjectのhooksを読み、itemsの無い応答を拒否する', async () => {
    const fetch = stubJsonResponse({ items: [] });
    await expect(hooksApi.list('project')).resolves.toEqual([]);
    expect(fetch.mock.calls[0]?.[0]).toBe('/api/projects/project/hooks');
    stubJsonResponse({});
    await expect(hooksApi.list('project')).rejects.toBeInstanceOf(ApiError);
  });

  it('作成は本文をPOSTし、一度だけ返る秘密鍵とpathを返す', async () => {
    const created = {
      hook: webhook,
      webhookSecret: 'secret',
      webhookPath: `/api/hooks/${HOOK_ID}/webhook`,
    } satisfies HookCreated;
    const fetch = stubJsonResponse(created, 201);
    const body = {
      name: 'Webhook',
      trigger: 'webhook' as const,
      webhookSignature: 'github' as const,
      template: { experimentId: 'e', kind: 'inference' as const, codeVersionId: 'c', targetId: 't' },
    };
    await expect(hooksApi.create('project', body)).resolves.toEqual(created);
    expect(fetch.mock.calls[0]?.[1].method).toBe('POST');
    expect(sentBody(fetch)).toEqual(body);
  });

  it('hookの無い作成の応答は、秘密鍵を見せずに契約違反として扱う', async () => {
    stubJsonResponse({ webhookSecret: 'secret' }, 201);
    await expect(
      hooksApi.create('project', {
        name: 'Webhook',
        trigger: 'manual',
        template: { experimentId: 'e', kind: 'inference', codeVersionId: 'c', targetId: 't' },
      }),
    ).rejects.toMatchObject({ code: 'invalid_response' });
  });

  it('有効・無効はenabledだけをPATCHする', async () => {
    const fetch = stubJsonResponse({ ...webhook, enabled: false });
    await hooksApi.setEnabled('project', 'hook/1', false);
    expect(fetch.mock.calls[0]?.[0]).toBe('/api/projects/project/hooks/hook%2F1');
    expect(fetch.mock.calls[0]?.[1].method).toBe('PATCH');
    expect(sentBody(fetch)).toEqual({ enabled: false });
  });

  it('所有者の移管は移管先のService AccountだけをPUTし、移管先の拒否をサーバーの理由つきで返す', async () => {
    const fetch = stubJsonResponse({ ...webhook, runAsUserId: SERVICE_ACCOUNT_ID, runAsKind: 'service' });
    await expect(
      hooksApi.transferOwner('project', 'hook/1', { serviceAccountId: SERVICE_ACCOUNT_ID }),
    ).resolves.toMatchObject({ runAsUserId: SERVICE_ACCOUNT_ID });
    expect(fetch.mock.calls[0]?.[0]).toBe('/api/projects/project/hooks/hook%2F1/owner');
    expect(fetch.mock.calls[0]?.[1].method).toBe('PUT');
    expect(sentBody(fetch)).toEqual({ serviceAccountId: SERVICE_ACCOUNT_ID });
    stubJsonResponse({ error: '移管先は有効なService Accountにしてください', code: 'invalid_hook_owner' }, 422);
    await expect(
      hooksApi.transferOwner('project', 'hook', { serviceAccountId: 'viewer-bot' }),
    ).rejects.toMatchObject({ code: 'invalid_hook_owner' });
  });

  it('手動の起動は本文と重複防止キーを送り、manual以外の拒否をサーバーの理由つきで返す', async () => {
    const fetch = stubJsonResponse(queuedExecution, 201);
    await hooksApi.trigger('project', 'hook', { payload: { shard: 1 }, idempotencyKey: 'key' });
    expect(fetch.mock.calls[0]?.[0]).toBe('/api/projects/project/hooks/hook/trigger');
    expect(sentBody(fetch)).toEqual({ payload: { shard: 1 }, idempotencyKey: 'key' });
    stubJsonResponse({ error: 'manualのフックだけを起動できます', code: 'hook_not_manual' }, 422);
    await expect(hooksApi.trigger('project', 'hook', {})).rejects.toThrow(
      'manualのフックだけを起動できます',
    );
  });

  it('実行履歴はフックとcursorで絞り、ページの形を確かめる', async () => {
    const fetch = stubJsonResponse({ items: [], nextCursor: 'next' });
    await expect(
      hooksApi.executions('project', { hookId: 'hook', cursor: 'cursor' }),
    ).resolves.toEqual({ items: [], nextCursor: 'next' });
    const url = new URL(`http://test${fetch.mock.calls[0]?.[0] as string}`);
    expect(url.pathname).toBe('/api/projects/project/hook-executions');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      limit: String(HOOK_EXECUTION_PAGE_SIZE),
      hookId: 'hook',
      cursor: 'cursor',
    });
    const all = stubJsonResponse({ items: [], nextCursor: null });
    await hooksApi.executions('project', {});
    expect(all.mock.calls[0]?.[0]).toBe(
      `/api/projects/project/hook-executions?limit=${HOOK_EXECUTION_PAGE_SIZE}`,
    );
    stubJsonResponse({ items: [], nextCursor: 3 });
    await expect(hooksApi.executions('project', {})).rejects.toMatchObject({ code: 'invalid_response' });
  });
});
