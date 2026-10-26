import { ApiError } from '@mado/design-system/http';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ReportBlock, ReportDetail, ReportEmbedBlock, Run, SavedView, SavedViewState } from '@mmt/contracts';
import { isReportRevisionConflict, reportsApi } from './reports';
import { loadLiveBlockData } from './reportLiveData';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const createdAt = '2026-10-08T00:00:00.000Z';
const projectId = '00000000-0000-4000-8000-000000000001';
const user = { id: '00000000-0000-4000-8000-000000000002', displayName: '検証担当' };
const reportId = '00000000-0000-4000-8000-000000000003';
const document = {
  report: {
    id: reportId,
    projectId,
    title: '週報',
    currentRevision: 2,
    createdBy: user,
    createdAt,
    updatedBy: user,
    updatedAt: createdAt,
    archivedAt: null,
    archivedBy: null,
  },
  revision: {
    reportId,
    revision: 2,
    title: '週報',
    message: null,
    createdBy: user,
    createdAt,
    restoredFromRevision: null,
    blocks: [],
  },
} satisfies ReportDetail;
const blocks: ReportBlock[] = [{ id: 'b1', type: 'markdown', text: '# 結果' }];
const viewState = {
  version: 1,
  experimentIds: [],
  filter: "params.lr = '0.1'",
  orderBy: [],
  statuses: [],
  kinds: [],
  columns: [],
  chartPanels: { version: 1, columns: 12, panels: [] },
} satisfies SavedViewState;
function savedView(id: string, visibility: SavedView['visibility']): SavedView {
  return {
    id,
    projectId,
    ownerUserId: user.id,
    visibility,
    page: 'runs',
    name: id,
    state: viewState,
    createdAt,
    updatedAt: createdAt,
  };
}
function run(id: string, name: string): Run {
  return {
    id,
    projectId,
    experimentId: '00000000-0000-4000-8000-000000000004',
    name,
    kind: 'training',
    status: 'finished',
    parameters: {},
    tags: {},
    latestMetrics: {},
    modelVersionId: null,
    codeVersionId: null,
    inputDatasetVersionIds: [],
    upstreamDatasetVersionIds: [],
    outputDatasetVersionIds: [],
    outputModelVersionIds: [],
    parentRunId: null,
    environment: {},
    createdBy: user.id,
    createdByName: user.displayName,
    createdAt,
    startedAt: null,
    endedAt: null,
    error: null,
  };
}

afterEach(() => vi.unstubAllGlobals());

const requests = (fetch: ReturnType<typeof vi.fn>) =>
  fetch.mock.calls.map(([path, options]) => [path, options?.method ?? 'GET', options?.body ? JSON.parse(options.body) : undefined]);

describe('レポートAPIのpathとbody', () => {
  it('一覧はアーカイブ済みを頼んだときだけincludeArchivedを付ける', async () => {
    const fetch = vi.fn().mockImplementation(() => Promise.resolve(json({ items: [], nextCursor: null })));
    vi.stubGlobal('fetch', fetch);
    await reportsApi.list('project', { includeArchived: false });
    await reportsApi.list('project', { includeArchived: true, cursor: 'next' });
    expect(fetch.mock.calls.map(([path]) => path)).toEqual([
      '/api/projects/project/reports',
      '/api/projects/project/reports?includeArchived=true&cursor=next',
    ]);
  });

  it('過去のバージョンはrevisionをqueryで、固定データはバージョンごとに読む', async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce(json(document))
      .mockResolvedValueOnce(json(document))
      .mockResolvedValueOnce(json({ items: [] }))
      .mockResolvedValueOnce(json({ revision: 1, items: [] }));
    vi.stubGlobal('fetch', fetch);
    await reportsApi.get('project', 'report/1');
    await reportsApi.get('project', 'report/1', { revision: 1 });
    await reportsApi.revisions('project', 'report/1');
    await reportsApi.snapshots('project', 'report/1', 1);
    expect(fetch.mock.calls.map(([path]) => path)).toEqual([
      '/api/projects/project/reports/report%2F1',
      '/api/projects/project/reports/report%2F1?revision=1',
      '/api/projects/project/reports/report%2F1/revisions',
      '/api/projects/project/reports/report%2F1/snapshots?revision=1',
    ]);
  });

  it('保存は編集を始めたバージョンと作り直す固定ブロックをPUTし、戻すとアーカイブはPOSTする', async () => {
    // アーカイブと解除はレポートだけを、ほかはレポートとバージョンを返す。
    const fetch = vi
      .fn()
      .mockImplementation((path: string) =>
        Promise.resolve(json(/\/(un)?archive$/.test(path) ? document.report : document)),
      );
    vi.stubGlobal('fetch', fetch);
    await reportsApi.create('project', { title: '週報', blocks });
    await reportsApi.update('project', 'report', {
      baseRevision: 2,
      title: '週報',
      blocks,
      message: '図を追加',
      refreshSnapshotBlockIds: ['b2'],
    });
    await reportsApi.restore('project', 'report', { revision: 1 });
    await reportsApi.archive('project', 'report');
    await reportsApi.unarchive('project', 'report');
    expect(requests(fetch)).toEqual([
      ['/api/projects/project/reports', 'POST', { title: '週報', blocks }],
      [
        '/api/projects/project/reports/report',
        'PUT',
        { baseRevision: 2, title: '週報', blocks, message: '図を追加', refreshSnapshotBlockIds: ['b2'] },
      ],
      ['/api/projects/project/reports/report/restore', 'POST', { revision: 1 }],
      ['/api/projects/project/reports/report/archive', 'POST', undefined],
      ['/api/projects/project/reports/report/unarchive', 'POST', undefined],
    ]);
  });

  it('409 report_revision_conflictだけをバージョンの衝突として見分ける', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(json({ error: '別のバージョンが保存されています', code: 'report_revision_conflict' }, 409)),
    );
    const failure = await reportsApi.update('project', 'report', { baseRevision: 1, title: 't', blocks }).catch((error) => error);
    expect(isReportRevisionConflict(failure)).toBe(true);
    expect(isReportRevisionConflict(new ApiError({ status: 409, code: 'other_conflict', message: 'conflict' }))).toBe(false);
    expect(
      isReportRevisionConflict(new ApiError({ status: 422, code: 'report_revision_conflict', message: 'invalid' })),
    ).toBe(false);
  });

  it('埋め込める保存ビューはプロジェクトに公開したものだけにする', async () => {
    const sharedViewId = '00000000-0000-4000-8000-0000000000a2';
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        json({ items: [savedView('00000000-0000-4000-8000-0000000000a1', 'private'), savedView(sharedViewId, 'project')] }),
      ),
    );
    expect((await reportsApi.shareableSavedViews('project')).map((view) => view.id)).toEqual([sharedViewId]);
  });

  it('バージョンや配列の欠けた応答は契約違反として扱う', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json({ report: document.report })));
    await expect(reportsApi.get('project', 'report')).rejects.toMatchObject({ code: 'invalid_response' });
  });
});

describe('liveの埋め込みの取得', () => {
  const signal = new AbortController().signal;

  it('保存ビューのグループ図は、ビューを読んでその検索条件でグループを頼む', async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce(json(savedView('00000000-0000-4000-8000-0000000000a3', 'project')))
      .mockResolvedValueOnce(json({ groups: [] }));
    vi.stubGlobal('fetch', fetch);
    const block: ReportEmbedBlock = {
      id: 'chart',
      type: 'chart',
      runSet: { savedViewId: '00000000-0000-4000-8000-0000000000a3' },
      mode: 'live',
      panel: {
        id: 'chart',
        metricKeys: ['loss'],
        xAxis: { kind: 'step' },
        yScale: 'linear',
        smoothing: { kind: 'none', weight: 0 },
        showRange: true,
        groupBy: { kind: 'param', key: 'lr' },
        layout: { x: 0, y: 0, w: 12, h: 2 },
      },
    };
    const data = await loadLiveBlockData('project', block, signal);
    expect(data).toEqual({ type: 'chart', runs: [], groups: [] });
    const [viewRequest, groupsRequest] = requests(fetch);
    expect(viewRequest![0]).toBe('/api/projects/project/saved-views/00000000-0000-4000-8000-0000000000a3');
    expect(groupsRequest![0]).toBe('/api/projects/project/metrics/groups');
    expect(groupsRequest![2]).toMatchObject({ search: { filter: "params.lr = '0.1'" }, groupBy: { kind: 'param', key: 'lr' }, keys: ['loss'] });
  });

  it('選んだRunの一覧は報告に並べた順で返し、見えないRunは抜ける', async () => {
    const [a, hidden, b] = ['a', 'f', 'b'].map((suffix) => `00000000-0000-4000-8000-00000000000${suffix}`) as [string, string, string];
    const fetch = vi.fn().mockResolvedValue(json({ items: [run(b, 'B'), run(a, 'A')], nextCursor: null }));
    vi.stubGlobal('fetch', fetch);
    const data = await loadLiveBlockData(
      'project',
      { id: 't', type: 'run_table', runSet: { runIds: [a, hidden, b] }, columns: [], limit: 50, mode: 'live' },
      signal,
    );
    expect(data.type === 'run_table' && data.runs.map((listed) => listed.id)).toEqual([a, b]);
    expect(requests(fetch)[0]![2]).toEqual({ filter: `attributes.run_id IN ('${a}', '${hidden}', '${b}')`, limit: 500 });
  });
});
