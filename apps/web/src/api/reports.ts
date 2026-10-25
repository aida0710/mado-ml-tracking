import type {
  ReportCreate,
  ReportDetail,
  ReportPage,
  ReportRestore,
  ReportRevisionSummary,
  ReportSnapshotList,
  ReportUpdate,
} from '@mmt/contracts';
import { assertCursorPage, encodeId, invalidResponseError, jsonRequest, projectPath, request, RequestError, requestItems } from './http';
import { savedViewsApi } from './savedViews';

/** 編集を始めたバージョンがもう最新でないときのAPIの応答。 */
export const REPORT_REVISION_CONFLICT_CODE = 'report_revision_conflict';

export function isReportRevisionConflict(failure: unknown): boolean {
  return failure instanceof RequestError && failure.status === 409 && failure.code === REPORT_REVISION_CONFLICT_CODE;
}

const reportsPath = (projectId: string) => `${projectPath(projectId)}/reports`;
const reportPath = (projectId: string, reportId: string) => `${reportsPath(projectId)}/${encodeId(reportId)}`;

function assertDetail(detail: ReportDetail): ReportDetail {
  if (
    typeof detail.report?.id !== 'string' ||
    typeof detail.revision?.revision !== 'number' ||
    !Array.isArray(detail.revision.blocks)
  )
    throw invalidResponseError();
  return detail;
}

export const reportsApi = {
  list: async (
    projectId: string,
    { includeArchived, cursor, signal }: { includeArchived: boolean; cursor?: string; signal?: AbortSignal },
  ) => {
    const query = new URLSearchParams();
    if (includeArchived) query.set('includeArchived', 'true');
    if (cursor) query.set('cursor', cursor);
    const search = query.toString();
    const page = await request<ReportPage>(`${reportsPath(projectId)}${search ? `?${search}` : ''}`, { signal });
    assertCursorPage(page);
    return page;
  },
  /** 最新のバージョン、または指定したバージョン（読み取り専用の履歴）。 */
  get: async (projectId: string, reportId: string, { revision, signal }: { revision?: number; signal?: AbortSignal } = {}) =>
    assertDetail(
      await request<ReportDetail>(
        `${reportPath(projectId, reportId)}${revision === undefined ? '' : `?revision=${revision}`}`,
        { signal },
      ),
    ),
  revisions: (projectId: string, reportId: string, signal?: AbortSignal) =>
    requestItems<ReportRevisionSummary>(`${reportPath(projectId, reportId)}/revisions`, signal),
  snapshots: async (projectId: string, reportId: string, revision: number, signal?: AbortSignal) => {
    const list = await request<ReportSnapshotList>(
      `${reportPath(projectId, reportId)}/snapshots?revision=${revision}`,
      { signal },
    );
    if (!Array.isArray(list.items)) throw invalidResponseError();
    return list.items;
  },
  create: async (projectId: string, input: ReportCreate) =>
    assertDetail(await request<ReportDetail>(reportsPath(projectId), jsonRequest('POST', input))),
  /** 上書きせず、409 report_revision_conflict（isReportRevisionConflict）で拒む。 */
  update: async (projectId: string, reportId: string, input: ReportUpdate) =>
    assertDetail(await request<ReportDetail>(reportPath(projectId, reportId), jsonRequest('PUT', input))),
  restore: async (projectId: string, reportId: string, input: ReportRestore) =>
    assertDetail(
      await request<ReportDetail>(`${reportPath(projectId, reportId)}/restore`, jsonRequest('POST', input)),
    ),
  archive: (projectId: string, reportId: string) =>
    request<unknown>(`${reportPath(projectId, reportId)}/archive`, { method: 'POST' }),
  unarchive: (projectId: string, reportId: string) =>
    request<unknown>(`${reportPath(projectId, reportId)}/unarchive`, { method: 'POST' }),
  /**
   * レポートに埋め込めるRunの一覧の保存ビュー。privateのビューは、レポートのほかの読者が開けず
   * APIが拒むので除く。
   */
  shareableSavedViews: async (projectId: string, signal?: AbortSignal) =>
    (await savedViewsApi.list(projectId, 'runs', signal)).filter((view) => view.visibility === 'project'),
};
