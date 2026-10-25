import { reportsApi } from '../api/reports';
import { useCursorPages } from './useCursorPages';

/** Projectのレポートを更新の新しい順にページごとに読む。アーカイブしたものは求めたときだけ。 */
export function useReportList(projectId: string, includeArchived: boolean) {
  return useCursorPages(`${projectId}:reports:${includeArchived}`, (cursor, signal) =>
    reportsApi.list(projectId, { includeArchived, cursor, signal }),
  );
}
