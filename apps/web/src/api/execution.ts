import { jsonRequestInit, requestJson } from '@mado/design-system/http';
import type { JobRetryRequest } from '@mmt/contracts';
import {
  computeTargetDetailsSchema,
  computeTargetOverviewSchema,
  itemsOf,
  jobListItemSchema,
  jobSchema,
  runCheckpointPageSchema,
  taskExecutionSchema,
  workerPresenceSchema,
} from '@mmt/contracts/schemas';
import type { CreateJob, CreateTarget, LaunchJob, UpdateTarget } from './inputs';
import { encodeId, projectPath } from './http';

const jobPath = (projectId: string, jobId?: string) =>
  `${projectPath(projectId)}/jobs${jobId ? `/${encodeId(jobId)}` : ''}`;
const runCheckpointsPath = (projectId: string, runId: string) =>
  `${projectPath(projectId)}/runs/${encodeId(runId)}/checkpoints`;

export interface RunCheckpointQuery {
  /** 保持数を超えたcheckpoint（retained=false）も一覧に出す。それらからも再開できる。 */
  includeHidden?: boolean;
}

/** Runのcheckpointを、stepの大きい順に返す。 */
function listRunCheckpoints(projectId: string, runId: string, query: RunCheckpointQuery, signal?: AbortSignal) {
  const search = query.includeHidden ? '?includeHidden=true' : '';
  return requestJson(`${runCheckpointsPath(projectId, runId)}${search}`, {
    schema: runCheckpointPageSchema,
    init: { signal },
  });
}

const targetListSchema = itemsOf(computeTargetDetailsSchema);
const jobListSchema = itemsOf(jobListItemSchema);
const workerListSchema = itemsOf(workerPresenceSchema);

export const executionApi = {
  /**
   * すべてのコンピュータ（他人のprivateのものも）を、誰に見せてもよい範囲で返す。接続先や設定は
   * 含まない。ログインしている本人がそれぞれを使えるか・管理できるかも付く。
   */
  targetOverview: async (signal?: AbortSignal) =>
    (await requestJson('/api/targets/overview', { schema: itemsOf(computeTargetOverviewSchema), init: { signal } }))
      .items,
  /** ログインしている本人が使える・管理できるコンピュータを、見てよい範囲の全項目つきで返す。 */
  targets: async (signal?: AbortSignal) =>
    (await requestJson('/api/targets', { schema: targetListSchema, init: { signal } })).items,
  /** ログインしている本人がJobを動かせるコンピュータ（publicのものと自分のもの）。 */
  projectTargets: async (projectId: string, signal?: AbortSignal) =>
    (
      await requestJson(`/api/targets?${new URLSearchParams({ projectId })}`, {
        schema: targetListSchema,
        init: { signal },
      })
    ).items,
  createTarget: (body: CreateTarget) =>
    requestJson('/api/targets', { schema: computeTargetDetailsSchema, init: jsonRequestInit('POST', body) }),
  updateTarget: (id: string, body: UpdateTarget) =>
    requestJson(`/api/targets/${encodeId(id)}`, {
      schema: computeTargetDetailsSchema,
      init: jsonRequestInit('PATCH', body),
    }),
  jobs: async (projectId: string, signal?: AbortSignal) =>
    (await requestJson(jobPath(projectId), { schema: jobListSchema, init: { signal } })).items,
  /** 1つのRunのJob（新しい順）。キューに入れ直したRunには複数ある。 */
  runJobs: async (projectId: string, runId: string, signal?: AbortSignal) =>
    (
      await requestJson(`${jobPath(projectId)}?${new URLSearchParams({ runId })}`, {
        schema: jobListSchema,
        init: { signal },
      })
    ).items,
  createJob: (projectId: string, body: CreateJob) =>
    requestJson(jobPath(projectId), { schema: jobSchema, init: jsonRequestInit('POST', body) }),
  /** 新しいRunとそのJobを一度に作る。Jobが拒まれたらRunも残らない。 */
  launchJob: (projectId: string, body: LaunchJob) =>
    requestJson(`${jobPath(projectId)}/launch`, { schema: taskExecutionSchema, init: jsonRequestInit('POST', body) }),
  cancelJob: (projectId: string, id: string) =>
    requestJson(`${jobPath(projectId, id)}/cancel`, { schema: jobSchema, init: { method: 'POST' } }),
  /** 空の要求なら新しいRunを最初から始める。checkpointから始めるときはJobRetryRequestを参照。 */
  retryJob: (projectId: string, id: string, body: JobRetryRequest) =>
    requestJson(`${jobPath(projectId, id)}/retry`, { schema: taskExecutionSchema, init: jsonRequestInit('POST', body) }),
  listRunCheckpoints,
  workers: async (projectId: string, signal?: AbortSignal) =>
    (await requestJson(`${projectPath(projectId)}/workers`, { schema: workerListSchema, init: { signal } })).items,
  /** すべてのProjectのworker。全体管理者だけ（GET /workers）。 */
  allWorkers: async (signal?: AbortSignal) =>
    (await requestJson('/api/workers', { schema: workerListSchema, init: { signal } })).items,
};
