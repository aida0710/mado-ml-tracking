import type {
  PreprocessingReport,
  PreprocessingReportInput,
  PreprocessingReportResponse,
} from '@mmt/contracts';
import { encodeId, jsonRequest, projectPath, request } from './http';

const reportPath = (projectId: string, runId: string) =>
  `${projectPath(projectId)}/runs/${encodeId(runId)}/preprocessing-report`;

/** The preprocessing report of a processing Run: counts, reasons, quality values and samples. */
export const preprocessingReportsApi = {
  get: async (projectId: string, runId: string, signal?: AbortSignal) =>
    (await request<PreprocessingReportResponse>(reportPath(projectId, runId), { signal })).report,
  save: (projectId: string, runId: string, report: PreprocessingReportInput) =>
    request<PreprocessingReport>(reportPath(projectId, runId), jsonRequest('PUT', report)),
};
