import { isApiError, jsonRequestInit, requestJson } from '@mado/design-system/http';
import type { ReportCreate, ReportRestore, ReportUpdate } from '@mmt/contracts';
import {
  reportDetailSchema,
  reportPageSchema,
  reportRevisionListSchema,
  reportSchema,
  reportSnapshotListSchema,
} from '@mmt/contracts/schemas';
import { encodeId, projectPath } from './http';
import { savedViewsApi } from './savedViews';

/** 編集を始めたバージョンがもう最新でないときのAPIの応答。 */
export const REPORT_REVISION_CONFLICT_CODE = 'report_revision_conflict';

export function isReportRevisionConflict(failure: unknown): boolean {
  return isApiError(failure) && failure.status === 409 && failure.code === REPORT_REVISION_CONFLICT_CODE;
}

const reportsPath = (projectId: string) => `${projectPath(projectId)}/reports`;
const reportPath = (projectId: string, reportId: string) => `${reportsPath(projectId)}/${encodeId(reportId)}`;

export const reportsApi = {
  list: (
    projectId: string,
    { includeArchived, cursor, signal }: { includeArchived: boolean; cursor?: string; signal?: AbortSignal },
  ) => {
    const query = new URLSearchParams();
    if (includeArchived) query.set('includeArchived', 'true');
    if (cursor) query.set('cursor', cursor);
    const search = query.toString();
    return requestJson(`${reportsPath(projectId)}${search ? `?${search}` : ''}`, {
      schema: reportPageSchema,
      init: { signal },
    });
  },
  /** 最新のバージョン、または指定したバージョン（読み取り専用の履歴）。 */
  get: (projectId: string, reportId: string, { revision, signal }: { revision?: number; signal?: AbortSignal } = {}) =>
    requestJson(`${reportPath(projectId, reportId)}${revision === undefined ? '' : `?revision=${revision}`}`, {
      schema: reportDetailSchema,
      init: { signal },
    }),
  revisions: async (projectId: string, reportId: string, signal?: AbortSignal) =>
    (
      await requestJson(`${reportPath(projectId, reportId)}/revisions`, {
        schema: reportRevisionListSchema,
        init: { signal },
      })
    ).items,
  snapshots: async (projectId: string, reportId: string, revision: number, signal?: AbortSignal) =>
    (
      await requestJson(`${reportPath(projectId, reportId)}/snapshots?revision=${revision}`, {
        schema: reportSnapshotListSchema,
        init: { signal },
      })
    ).items,
  create: (projectId: string, input: ReportCreate) =>
    requestJson(reportsPath(projectId), { schema: reportDetailSchema, init: jsonRequestInit('POST', input) }),
  /** 上書きせず、409 report_revision_conflict（isReportRevisionConflict）で拒む。 */
  update: (projectId: string, reportId: string, input: ReportUpdate) =>
    requestJson(reportPath(projectId, reportId), { schema: reportDetailSchema, init: jsonRequestInit('PUT', input) }),
  restore: (projectId: string, reportId: string, input: ReportRestore) =>
    requestJson(`${reportPath(projectId, reportId)}/restore`, {
      schema: reportDetailSchema,
      init: jsonRequestInit('POST', input),
    }),
  archive: (projectId: string, reportId: string) =>
    requestJson(`${reportPath(projectId, reportId)}/archive`, { schema: reportSchema, init: { method: 'POST' } }),
  unarchive: (projectId: string, reportId: string) =>
    requestJson(`${reportPath(projectId, reportId)}/unarchive`, { schema: reportSchema, init: { method: 'POST' } }),
  /**
   * レポートに埋め込めるRunの一覧の保存ビュー。privateのビューは、レポートのほかの読者が開けず
   * APIが拒むので除く。
   */
  shareableSavedViews: async (projectId: string, signal?: AbortSignal) =>
    (await savedViewsApi.list(projectId, 'runs', signal)).filter((view) => view.visibility === 'project'),
};
