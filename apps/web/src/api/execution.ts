import type {
  ComputeTargetDetails,
  ComputeTargetOverview,
  Job,
  JobListItem,
  JobRetryRequest,
  Run,
  RunCheckpointPage,
  TaskExecution,
  WorkerPresence,
} from '@mmt/contracts';
import type { CreateJob, CreateTarget, LaunchJob, UpdateTarget } from './inputs';
import {
  encodeId,
  invalidResponseError,
  jsonRequest,
  projectPath,
  request,
  requestItems,
} from './http';

const jobPath = (projectId: string, jobId?: string) =>
  `${projectPath(projectId)}/jobs${jobId ? `/${encodeId(jobId)}` : ''}`;
const runCheckpointsPath = (projectId: string, runId: string) =>
  `${projectPath(projectId)}/runs/${encodeId(runId)}/checkpoints`;

export interface RunCheckpointQuery {
  /** 保持数を超えたcheckpoint（retained=false）も一覧に出す。それらからも再開できる。 */
  includeHidden?: boolean;
}

/** Runのcheckpointを、stepの大きい順に返す。 */
async function listRunCheckpoints(
  projectId: string,
  runId: string,
  query: RunCheckpointQuery,
  signal?: AbortSignal,
): Promise<RunCheckpointPage> {
  const search = query.includeHidden ? '?includeHidden=true' : '';
  const path = `${runCheckpointsPath(projectId, runId)}${search}`;
  const page = await request<RunCheckpointPage>(path, { signal });
  if (!Array.isArray(page.items)) throw invalidResponseError();
  return page;
}

export const executionApi = {
  /**
   * すべてのコンピュータ（他人のprivateのものも）を、誰に見せてもよい範囲で返す。接続先や設定は
   * 含まない。ログインしている本人がそれぞれを使えるか・管理できるかも付く。
   */
  targetOverview: (signal?: AbortSignal) =>
    requestItems<ComputeTargetOverview>('/targets/overview', signal),
  /** ログインしている本人が使える・管理できるコンピュータを、見てよい範囲の全項目つきで返す。 */
  targets: (signal?: AbortSignal) => requestItems<ComputeTargetDetails>('/targets', signal),
  /** ログインしている本人がJobを動かせるコンピュータ（publicのものと自分のもの）。 */
  projectTargets: (projectId: string, signal?: AbortSignal) =>
    requestItems<ComputeTargetDetails>(`/targets?${new URLSearchParams({ projectId })}`, signal),
  createTarget: (body: CreateTarget) =>
    request<ComputeTargetDetails>('/targets', jsonRequest('POST', body)),
  updateTarget: (id: string, body: UpdateTarget) =>
    request<ComputeTargetDetails>(`/targets/${encodeId(id)}`, jsonRequest('PATCH', body)),
  jobs: (projectId: string, signal?: AbortSignal) => requestItems<JobListItem>(jobPath(projectId), signal),
  /** 1つのRunのJob（新しい順）。キューに入れ直したRunには複数ある。 */
  runJobs: (projectId: string, runId: string, signal?: AbortSignal) =>
    requestItems<JobListItem>(`${jobPath(projectId)}?${new URLSearchParams({ runId })}`, signal),
  createJob: (projectId: string, body: CreateJob) =>
    request<Job>(jobPath(projectId), jsonRequest('POST', body)),
  /** 新しいRunとそのJobを一度に作る。Jobが拒まれたらRunも残らない。 */
  launchJob: (projectId: string, body: LaunchJob) =>
    request<TaskExecution>(`${jobPath(projectId)}/launch`, jsonRequest('POST', body)),
  cancelJob: (projectId: string, id: string) =>
    request<unknown>(`${jobPath(projectId, id)}/cancel`, { method: 'POST' }),
  /** 空の要求なら新しいRunを最初から始める。checkpointから始めるときはJobRetryRequestを参照。 */
  retryJob: (projectId: string, id: string, body: JobRetryRequest) =>
    request<{ run: Run; job: Job }>(`${jobPath(projectId, id)}/retry`, jsonRequest('POST', body)),
  listRunCheckpoints,
  workers: (projectId: string, signal?: AbortSignal) =>
    requestItems<WorkerPresence>(`${projectPath(projectId)}/workers`, signal),
  /** すべてのProjectのworker。全体管理者だけ（GET /workers）。 */
  allWorkers: (signal?: AbortSignal) => requestItems<WorkerPresence>('/workers', signal),
};
