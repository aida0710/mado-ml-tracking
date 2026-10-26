import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ComputeTargetDetails, ExperimentTask, PluginConnection, RunOutputRegistration } from '@mmt/contracts';
import { computeTargetDetails } from '../../tests/fixtures/execution';
import { tasksApi } from './tasks';
import { executionApi } from './execution';
import { pluginsApi } from './plugins';

const createdAt = '2026-10-08T00:00:00.000Z';
const PROJECT_ID = '00000000-0000-4000-8000-000000000001';
const task: ExperimentTask = {
  id: '00000000-0000-4000-8000-000000000002',
  projectId: PROJECT_ID,
  experimentId: '00000000-0000-4000-8000-000000000003',
  name: 'changed',
  description: '',
  kind: 'inference',
  codeVersionId: '00000000-0000-4000-8000-000000000004',
  modelVersionId: null,
  inputDatasetVersionIds: [],
  parameters: {},
  tags: {},
  targetId: null,
  gpuIds: [],
  gpuCount: 0,
  walltimeSeconds: null,
  revision: 8,
  createdAt,
  updatedAt: createdAt,
};
// 共有のfixtureはidがUUIDでないので、応答のスキーマに通るidに差し替える。
const disabledTarget: ComputeTargetDetails = {
  ...computeTargetDetails,
  id: '00000000-0000-4000-8000-000000000005',
  ownerUserId: '00000000-0000-4000-8000-000000000006',
  enabled: false,
};
const enabledPlugin: PluginConnection = {
  id: '00000000-0000-4000-8000-000000000007',
  projectId: PROJECT_ID,
  name: 'mado',
  kind: 'mado',
  config: {
    apiUrl: 'https://mado.example.invalid/api',
    webUrl: 'https://mado.example.invalid',
    lineageUrl: 'https://mado.example.invalid/lineage',
    jobNamespace: 'mmt',
    storageSystemKey: 'filesystem',
  },
  configRevision: 1,
  credentialsConfigured: { accessToken: true },
  secretStorageAvailable: true,
  tokenConfigured: true,
  enabled: true,
  manifest: null,
  accessTokenGrant: null,
  createdAt,
};

afterEach(() => vi.unstubAllGlobals());
describe('Taskと管理設定の変更', () => {
  it('出力モデルの登録結果が未確定（404）の間はnullを返し、確定後は結果を返す', async () => {
    const registration: RunOutputRegistration = {
      status: 'skipped',
      modelVersionId: '00000000-0000-4000-8000-000000000008',
      error: null,
      reason: 'already_registered_by_run',
    };
    const fetch = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: 'not found', code: 'not_found' }), { status: 404 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(registration), { status: 200 }));
    vi.stubGlobal('fetch', fetch);
    expect(await tasksApi.runOutputRegistration('project', 'run')).toBeNull();
    expect(await tasksApi.runOutputRegistration('project', 'run')).toEqual(registration);
    expect(fetch.mock.calls[0]?.[0]).toBe('/api/projects/project/runs/run/output-registration');
  });
  it('出力モデルの登録結果の取得失敗をnullとして隠さない', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: 'denied' }), { status: 403 })));
    await expect(tasksApi.runOutputRegistration('project', 'run')).rejects.toThrow();
  });
  it('Task更新は期待revisionを送り実験の変更をAPI入力に含めない', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify(task), { status: 200 }));
    vi.stubGlobal('fetch', fetch);
    await expect(tasksApi.update('project', 'task', { expectedRevision: 7, name: 'changed' })).resolves.toEqual(task);
    expect(fetch.mock.calls[0]?.[0]).toBe('/api/projects/project/tasks/task');
    expect(JSON.parse(fetch.mock.calls[0]?.[1].body)).toEqual({ expectedRevision: 7, name: 'changed' });
  });
  it('起動409を成功として扱わず再試行に返す', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: 'Task revision changed' }), { status: 409 })));
    await expect(tasksApi.launch('project', 'task', { expectedRevision: 7, executionMode: 'test' })).rejects.toThrow('Task revision changed');
  });
  it('Task履歴は50件とcursorを指定し次ページ情報を保持する', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ items: [], nextCursor: 'older' }), { status: 200 }));
    vi.stubGlobal('fetch', fetch);
    const controller = new AbortController();
    const page = await tasksApi.runs('project', 'task', { cursor: 'last-run', signal: controller.signal });
    expect(fetch.mock.calls[0]?.[0]).toBe('/api/projects/project/tasks/task/runs?limit=50&cursor=last-run');
    expect(fetch.mock.calls[0]?.[1].signal).toBe(controller.signal);
    expect(page).toEqual({ items: [], nextCursor: 'older' });
  });
  it('Task履歴のnextCursorが欠けている応答はページ終了として扱わない', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ items: [] }), { status: 200 })));
    await expect(tasksApi.runs('project', 'task')).rejects.toMatchObject({ code: 'invalid_response' });
  });
  it('有効無効の変更はenabledだけをPATCHし接続設定を書き戻さない', async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(disabledTarget), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(enabledPlugin), { status: 200 }));
    vi.stubGlobal('fetch', fetch);
    await expect(executionApi.updateTarget('target', { enabled: false })).resolves.toEqual(disabledTarget);
    await expect(pluginsApi.update('project', 'plugin', { enabled: true })).resolves.toEqual(enabledPlugin);
    expect(fetch.mock.calls.map(([path, options]) => [path, options.method, JSON.parse(options.body)])).toEqual([
      ['/api/targets/target', 'PATCH', { enabled: false }],
      ['/api/projects/project/plugins/plugin', 'PATCH', { enabled: true }],
    ]);
  });
});
