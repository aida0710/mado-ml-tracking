import type {
  CodeVersion,
  LogEntry,
  MetricPoint,
  ModelVersion,
  Run,
  RunLogList,
} from '@mmt/contracts';
import type { Principal } from '../auth/principal.js';
import { first, transaction, type Connection, type Database } from '../db/database.js';
import { conflict, DomainError } from '../domain/errors.js';
import { createExecutionSnapshot } from '../domain/executionSnapshot.js';
import { assertNoReservedRunTags } from '../domain/reservedRunTags.js';
import type { RunCreate, RunPatch } from '../domain/validation.js';
import { validateCodeCompatibility } from '../domain/compatibility.js';
import { validatePinnedRuntime } from '../domain/runtimeCompatibility.js';
import { validateCodeArtifacts } from '../repositories/runtimeArtifactRepository.js';
import { runColumns } from '../repositories/runListProjection.js';
import { isTerminalStatus, validateRunTransition } from '../domain/runTransitions.js';
import {
  findCodeVersion,
  findModelVersion,
  findRun,
  lockActiveExperiment,
} from '../repositories/registryRepository.js';
import {
  appendLogs,
  appendMetrics,
  listLatestLogs,
  listLogs,
  listLogsAfter,
  listMetrics,
} from '../repositories/telemetryRepository.js';
import { findOriginStepExecutionOfRun } from '../repositories/workflowExecutionRepository.js';
import { formatLogFileLine, logFileName } from '../domain/runLogFile.js';
import { requireProject } from './accessService.js';
import type { RunCompletionService } from './runCompletionService.js';
import { pinResumeCheckpoint } from './checkpointResume.js';
import { assertInputDatasetVersionsUsable } from './datasetVersionReferences.js';

// ログファイルのダウンロード中に1回のクエリで読む行数。1行300バイトとして約1.5MB。
const LOG_FILE_BATCH_LINES = 5000;

/**
 * Jobが持つRunは自動実行や評価が比べる根拠なので、Runが終了状態になったら記録を固定する。
 * Jobの無いRunは、MLflowと同じく終わったあとも書き込める。
 */
export async function assertRunRecordsWritable(
  connection: Connection,
  run: Pick<Run, 'id' | 'status'>,
): Promise<void> {
  if (!isTerminalStatus(run.status)) return;
  const job = await first(connection, 'SELECT id FROM jobs WHERE run_id=$1', [run.id]);
  if (job)
    throw new DomainError({
      status: 409,
      code: 'run_finalized',
      message: 'records cannot be added to or changed in a run whose job has ended',
    });
}

export class RunService {
  constructor(
    private readonly database: Database,
    private readonly runCompletion: RunCompletionService,
  ) {}

  async create(principal: Principal, projectId: string, input: RunCreate): Promise<Run> {
    assertNoReservedRunTags(input.tags);
    return transaction(this.database, async (connection) => {
      await requireProject(connection, principal, {
        projectId,
        role: 'editor',
        scope: 'runs:write',
      });
      const run = await this.insertRun(connection, {
        projectId,
        createdBy: principal.user.id,
        input,
      });
      return input.resumeCheckpointId
        ? pinResumeCheckpoint(connection, { run, checkpointId: input.resumeCheckpointId })
        : run;
    });
  }

  async insertRun(
    connection: Connection,
    registration: {
      // オフラインのクライアントが選び、再送で同じRunが見つかるようにする。指定が無ければ
      // DBが決める。
      id?: string;
      projectId: string;
      createdBy: string;
      input: RunCreate;
      task?: { id: string; revision: number };
      // 上流のRunの出力から来た入力（自動実行の連鎖）。入力の一部。
      upstreamDatasetVersionIds?: string[];
    },
  ): Promise<Run> {
    const { projectId, input } = registration;
    await lockActiveExperiment(connection, { projectId, id: input.experimentId });
    await assertInputDatasetVersionsUsable(connection, {
      projectId,
      ids: input.inputDatasetVersionIds,
    });
    if (input.parentRunId) await findRun(connection, { projectId, id: input.parentRunId });
    let model: ModelVersion | null = null;
    let code: CodeVersion | null = null;
    if (input.modelVersionId)
      model = await findModelVersion(connection, { projectId, id: input.modelVersionId });
    const codeVersionId = input.codeVersionId ?? model?.defaultCodeVersionId;
    if (codeVersionId)
      code = await findCodeVersion(connection, {
        projectId,
        id: codeVersionId,
      });
    if (code) {
      validateCodeCompatibility(code, { model, kind: input.kind });
      await validateCodeArtifacts(connection, code);
      if (input.environment.runtime !== undefined)
        validatePinnedRuntime(code.runtime, input.environment.runtime);
    }
    const mode = input.executionMode ?? 'run';
    if (!code && mode === 'test')
      throw new DomainError({
        status: 422,
        code: 'code_required',
        message: 'a test requires a code version',
      });
    const snapshot = code ? createExecutionSnapshot(code, mode) : null;
    return (await first<Run>(
      connection,
      `INSERT INTO runs(id,project_id,experiment_id,name,kind,parameters,tags,model_version_id,code_version_id,input_dataset_version_ids,parent_run_id,environment,created_by,execution_mode,execution_snapshot,task_id,task_revision,upstream_dataset_version_ids)
      VALUES(COALESCE($18::uuid,gen_random_uuid()),$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17) RETURNING ${runColumns}`,
      [
        projectId,
        input.experimentId,
        input.name,
        input.kind,
        JSON.stringify(input.parameters),
        JSON.stringify(input.tags),
        model?.id ?? null,
        code?.id ?? null,
        input.inputDatasetVersionIds,
        input.parentRunId ?? null,
        JSON.stringify(code ? { ...input.environment, runtime: code.runtime } : input.environment),
        registration.createdBy,
        mode,
        snapshot ? JSON.stringify(snapshot) : null,
        registration.task?.id ?? null,
        registration.task?.revision ?? null,
        registration.upstreamDatasetVersionIds ?? [],
        registration.id ?? null,
      ],
    ))!;
  }

  async get(principal: Principal, projectId: string, runId: string): Promise<Run> {
    await requireProject(this.database, principal, { projectId, role: 'viewer', scope: 'read' });
    return findRun(this.database, { projectId, id: runId });
  }

  async patch(
    principal: Principal,
    projectId: string,
    registration: { runId: string; input: RunPatch },
  ): Promise<Run> {
    const input = registration.input;
    if (input.tags) assertNoReservedRunTags(input.tags);
    return transaction(this.database, async (connection) => {
      await requireProject(connection, principal, {
        projectId,
        role: 'editor',
        scope: 'runs:write',
      });
      const run = await findRun(connection, { projectId, id: registration.runId, lock: true });
      if (
        (input.parameters || input.environment) &&
        (await findOriginStepExecutionOfRun(connection, { projectId, runId: run.id }))
      )
        throw new DomainError({
          status: 409,
          code: 'workflow_run_fixed',
          message: 'the execution settings of the workflow are fixed; create a new version',
        });
      if (input.tags || input.parameters) await assertRunRecordsWritable(connection, run);
      const isMlflowManaged = (run as Run & { mlflowManaged?: boolean }).mlflowManaged === true;
      if (isMlflowManaged && input.parameters) {
        for (const [key, value] of Object.entries(input.parameters)) {
          if (typeof value !== 'string') conflict('log MLflow params as strings');
          if (Object.hasOwn(run.parameters, key) && run.parameters[key] !== value)
            conflict('logged MLflow params cannot be changed');
        }
      }
      let tags = input.tags && { ...input.tags };
      const name = input.name ?? input.tags?.['mlflow.runName'];
      if (name !== undefined && (isMlflowManaged || Object.hasOwn(run.tags, 'mlflow.runName')))
        (tags ??= {})['mlflow.runName'] = name;
      if (input.environment?.runtime !== undefined && run.codeVersionId) {
        const code = await findCodeVersion(connection, {
          projectId,
          id: run.codeVersionId,
        });
        validatePinnedRuntime(code.runtime, input.environment.runtime);
      }
      const environment = input.environment && {
        ...input.environment,
        ...(run.codeVersionId ? { runtime: run.environment.runtime } : {}),
      };
      const status = input.status ?? run.status;
      const job = await first<{ status: string }>(
        connection,
        'SELECT status FROM jobs WHERE run_id=$1',
        [run.id],
      );
      if (job && job.status !== 'queued' && (input.parameters || input.environment))
        conflict('execution settings cannot be changed after the job has started');
      if (input.status) {
        if (job) conflict('the status of a run managed by a job cannot be changed');
        validateRunTransition(run.status, status);
      }
      const updated = (await first<Run>(
        connection,
        `UPDATE runs SET name=COALESCE($2,name),tags=tags||COALESCE($3::jsonb,'{}'::jsonb),environment=COALESCE($4::jsonb,environment),parameters=parameters||COALESCE($7::jsonb,'{}'::jsonb),
        status=$5, started_at=CASE WHEN $5='running' THEN COALESCE(started_at,now()) ELSE started_at END,
        ended_at=CASE WHEN $6 THEN COALESCE(ended_at,now()) ELSE ended_at END WHERE id=$1 RETURNING ${runColumns}`,
        [
          run.id,
          name,
          tags ? JSON.stringify(tags) : null,
          environment ? JSON.stringify(environment) : null,
          status,
          isTerminalStatus(status),
          input.parameters ? JSON.stringify(input.parameters) : null,
        ],
      ))!;
      if (status !== run.status)
        await this.runCompletion.recordStatusChange(connection, {
          previousStatus: run.status,
          run: updated,
        });
      return updated;
    });
  }

  async metrics(principal: Principal, projectId: string, runId: string): Promise<MetricPoint[]> {
    await this.get(principal, projectId, runId);
    return listMetrics(this.database, runId);
  }

  async addMetrics(
    principal: Principal,
    projectId: string,
    registration: { runId: string; metrics: MetricPoint[] },
  ): Promise<void> {
    await this.writeTelemetry(principal, {
      projectId,
      runId: registration.runId,
      isRunRecord: true,
      append: (connection) => appendMetrics(connection, registration.runId, registration.metrics),
    });
  }

  /** Runのすべての行。`tail`を指定したら最新のその行数だけ。古い順に返す。 */
  async logs(
    principal: Principal,
    projectId: string,
    query: { runId: string; tail?: number },
  ): Promise<RunLogList> {
    const { runId, tail } = query;
    await this.get(principal, projectId, runId);
    if (tail !== undefined) return listLatestLogs(this.database, { runId, tail });
    const items = await listLogs(this.database, runId);
    return { items, totalCount: items.length };
  }

  /**
   * Runのすべての行をファイルとして返す。クライアントが受け取るのに合わせてまとめて読むので、
   * 長いログをここでもブラウザでもメモリに抱えない。
   */
  async logFile(
    principal: Principal,
    projectId: string,
    runId: string,
  ): Promise<{ fileName: string; chunks: AsyncGenerator<string> }> {
    const run = await this.get(principal, projectId, runId);
    return { fileName: logFileName(run.name), chunks: this.logFileChunks(runId) };
  }

  private async *logFileChunks(runId: string): AsyncGenerator<string> {
    let afterId: string | null = null;
    for (;;) {
      const batch = await listLogsAfter(this.database, {
        runId,
        afterId,
        limit: LOG_FILE_BATCH_LINES,
      });
      if (!batch.length) return;
      yield batch.map(formatLogFileLine).join('');
      afterId = batch.at(-1)!.id;
    }
  }

  async addLogs(
    principal: Principal,
    projectId: string,
    registration: { runId: string; entries: LogEntry[] },
  ): Promise<void> {
    await this.writeTelemetry(principal, {
      projectId,
      runId: registration.runId,
      isRunRecord: false,
      append: (connection) => appendLogs(connection, registration.runId, registration.entries),
    });
  }

  private async writeTelemetry(
    principal: Principal,
    request: {
      projectId: string;
      runId: string;
      // ログは何とも比べない診断用の情報なので、Jobとともに固定するのは記録（メトリクス）だけ。
      isRunRecord: boolean;
      append: (connection: Connection) => Promise<void>;
    },
  ): Promise<void> {
    await transaction(this.database, async (connection) => {
      await requireProject(connection, principal, {
        projectId: request.projectId,
        role: 'editor',
        scope: 'runs:write',
      });
      const run = await findRun(connection, {
        projectId: request.projectId,
        id: request.runId,
        lock: true,
      });
      if (request.isRunRecord) await assertRunRecordsWritable(connection, run);
      await request.append(connection);
    });
  }
}
