import { jsonRequestInit, requestJson } from '@mado/design-system/http';
import type { PreprocessingReportInput } from '@mmt/contracts';
import { preprocessingReportResponseSchema, preprocessingReportSchema } from '@mmt/contracts/schemas';
import { encodeId, projectPath } from './http';

const reportPath = (projectId: string, runId: string) =>
  `${projectPath(projectId)}/runs/${encodeId(runId)}/preprocessing-report`;

/** データ処理のRunの前処理レポート（件数、理由、品質値、サンプル）。 */
export const preprocessingReportsApi = {
  get: async (projectId: string, runId: string, signal?: AbortSignal) =>
    (await requestJson(reportPath(projectId, runId), { schema: preprocessingReportResponseSchema, init: { signal } }))
      .report,
  save: (projectId: string, runId: string, report: PreprocessingReportInput) =>
    requestJson(reportPath(projectId, runId), {
      schema: preprocessingReportSchema,
      init: jsonRequestInit('PUT', report),
    }),
};
