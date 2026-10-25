import type { SweepStatusReason, SweepTrial } from '@mmt/contracts';
import { first, type Connection } from '../db/database.js';
import { DomainError } from '../domain/errors.js';
import { isTerminalStatus } from '../domain/runTransitions.js';
import { shouldStop } from '../domain/sweeps/hyperband.js';
import { countGridCombinations } from '../domain/sweeps/searchSpace.js';
import { suggestTrial } from '../domain/sweeps/suggestTrial.js';
import { computeObjective } from '../domain/sweeps/trialObjective.js';
import type {
  CompletedTrial,
  EarlyStoppingConfig,
  MetricPoint,
  SearchSpace,
  TrialParameters,
} from '../domain/sweeps/types.js';
import { findTask } from '../repositories/experimentTaskRepository.js';
import {
  ACTIVE_TRIAL_STATES,
  finishTrial,
  hasSweepOwnerAccess,
  insertTrial,
  listObjectiveHistories,
  listSweepTrials,
  lockSweepById,
  markTrialEarlyStopped,
  markTrialsRunning,
  TERMINAL_SWEEP_STATUSES,
  updateSweepStatus,
  type StoredSweep,
} from '../repositories/sweepRepository.js';
import type { JobService } from './jobService.js';
import type { TaskService } from './taskService.js';

// trialのRunをそのSweepに結びつける、予約済みのRunのタグ（mmt.*はサーバーだけが書く）。
export const SWEEP_ID_TAG = 'mmt.sweepId';
export const SWEEP_TRIAL_INDEX_TAG = 'mmt.sweepTrialIndex';
export const SWEEP_EARLY_STOPPED_TAG = 'mmt.sweepEarlyStopped';
// 生成するRunの名前にも、利用者が作るRunの名前と同じ上限を当てる。
const RUN_NAME_LIMIT = 200;
const TRIAL_LAUNCH_SAVEPOINT = 'sweep_trial_launch';
// ほかのバックグラウンドのロックと同じく、同じスキーマのすべてのAPIのプロセスで共有する。
const SWEEP_LOCK_PREFIX = 'sweep';

const COMPLETED_TRIAL_STATES = new Set(['finished', 'failed', 'early_stopped']);

/**
 * Sweepの状態機械。parallelismとmax_trialsまでtrialを起動し、hyperbandがrungの足切りより下に
 * 順位付けたtrialを止め、trialの結果を記録してSweepを終える。どの入口も、呼び出し元の
 * トランザクションの中でSweepのadvisory lockを持って動くので、スケジューラ、完了時のハンドラ、
 * APIが同じtrialの番号を2回起動することはない。
 */
export class SweepController {
  constructor(
    private readonly tasks: TaskService,
    private readonly jobs: JobService,
  ) {}

  /**
   * Sweepのロックを取れるまで待ち、トランザクションの終わりまで持つ。同じトランザクションの
   * 中では再入できる。
   */
  async lock(connection: Connection, sweepId: string): Promise<void> {
    await connection.query(
      "SELECT pg_advisory_xact_lock(hashtextextended($1||':'||$2||':'||current_schema(),0))",
      [SWEEP_LOCK_PREFIX, sweepId],
    );
  }

  /** 別のトランザクションがSweepを進めているときはfalse。スケジューラはそのSweepを飛ばす。 */
  async tryLock(connection: Connection, sweepId: string): Promise<boolean> {
    const lock = await connection.query<{ acquired: boolean }>(
      "SELECT pg_try_advisory_xact_lock(hashtextextended($1||':'||$2||':'||current_schema(),0)) AS acquired",
      [SWEEP_LOCK_PREFIX, sweepId],
    );
    return lock.rows[0]?.acquired === true;
  }

  /**
   * Sweepを最新の状態にする。早期終了はほかのtrialのJobを取り消すので、それを求めるのは
   * スケジューラだけ。終わったtrialのRunのロックを既に持っている完了時のハンドラは求めない。
   */
  async tick(
    connection: Connection,
    request: { sweepId: string; applyEarlyStopping: boolean },
  ): Promise<void> {
    const sweep = await lockSweepById(connection, request.sweepId);
    if (!sweep || TERMINAL_SWEEP_STATUSES.includes(sweep.status)) return;
    await markTrialsRunning(connection, sweep.id);
    const trials = await listSweepTrials(connection, sweep.id);
    // 普段は完了時のハンドラが結果を記録する。ここでは、そのハンドラが失敗した分を拾う。
    for (const trial of trials)
      if (ACTIVE_TRIAL_STATES.includes(trial.state) && isTerminalStatus(trial.runStatus))
        await this.recordOutcome(connection, { sweep, trial });
    if (request.applyEarlyStopping && sweep.earlyStopping)
      await this.stopTrialsBelowCutoff(connection, { sweep, trials });
    if (sweep.status === 'running') await this.launchTrials(connection, sweep);
  }

  /** trialのRunが終わったときに終了時のハンドラから呼ばれる。結果を記録し、空いた枠を埋める。 */
  async recordTrialEnd(connection: Connection, trial: SweepTrial): Promise<void> {
    await this.lock(connection, trial.sweepId);
    const sweep = await lockSweepById(connection, trial.sweepId);
    if (!sweep) return;
    await this.recordOutcome(connection, { sweep, trial });
    await this.tick(connection, { sweepId: sweep.id, applyEarlyStopping: false });
  }

  /** 今trialを起動できない理由。起動できるならnull。再開の前にも使う。 */
  async launchBlocker(
    connection: Connection,
    sweep: StoredSweep,
  ): Promise<'owner_forbidden' | 'task_revision_changed' | null> {
    // 自動実行ルールと同じく、起動するときに作成者の権限を確かめ直す。
    if (!(await hasSweepOwnerAccess(connection, sweep))) return 'owner_forbidden';
    const task = await findTask(connection, { projectId: sweep.projectId, id: sweep.taskId });
    return task.revision === sweep.taskRevision ? null : 'task_revision_changed';
  }

  private async recordOutcome(
    connection: Connection,
    outcome: { sweep: StoredSweep; trial: SweepTrial },
  ): Promise<void> {
    const { sweep, trial } = outcome;
    const runStatus = trial.runStatus;
    if (!isTerminalStatus(runStatus)) return;
    const histories = await listObjectiveHistories(connection, {
      runIds: [trial.runId],
      metric: sweep.objective.metric,
    });
    const history = histories.get(trial.runId)!;
    const objectiveValue = computeObjective(history, sweep.objective.aggregation);
    await finishTrial(connection, {
      trialId: trial.id,
      state: runStatus,
      objectiveValue,
      objectiveStep: findObjectiveStep(history, {
        objectiveValue,
        aggregation: sweep.objective.aggregation,
      }),
    });
  }

  private async stopTrialsBelowCutoff(
    connection: Connection,
    progress: { sweep: StoredSweep; trials: SweepTrial[] },
  ): Promise<void> {
    const { sweep, trials } = progress;
    const running = trials.filter((trial) => trial.state === 'running');
    if (running.length === 0) return;
    const started = trials.filter((trial) => trial.state !== 'queued');
    const histories = await listObjectiveHistories(connection, {
      runIds: started.map((trial) => trial.runId),
      metric: sweep.objective.metric,
    });
    const peers = started.map((trial) => ({
      trialIndex: trial.trialIndex,
      objectiveHistory: histories.get(trial.runId)!,
    }));
    for (const trial of running) {
      const decision = shouldStop({
        trialIndex: trial.trialIndex,
        objectiveHistory: histories.get(trial.runId)!,
        peers,
        goal: sweep.objective.goal,
        config: sweep.earlyStopping as EarlyStoppingConfig,
      });
      if (decision.stop)
        await this.stopTrial(connection, { sweep, trial, stopReason: `hyperband_rung_${decision.rung}` });
    }
  }

  private async stopTrial(
    connection: Connection,
    stop: { sweep: StoredSweep; trial: SweepTrial; stopReason: string },
  ): Promise<void> {
    const { sweep, trial } = stop;
    // このJobを完了させるworkerは、Jobのロックを持ったまま、完了時のハンドラでこのSweepの
    // ロックを待つ。ここで待つとデッドロックになるので、そのtrialは次のtickに回す。
    const job = await first<{ status: string }>(
      connection,
      'SELECT status FROM jobs WHERE id=$1 FOR UPDATE SKIP LOCKED',
      [trial.jobId],
    );
    // claimed・runningのJobだけを取り消す。順番待ちのJobを取り消すと、このtickの中で
    // Runが終わってしまう。
    if (!job || job.status === 'queued' || isTerminalStatus(job.status)) return;
    await this.jobs.requestCancelInTransaction(connection, {
      projectId: sweep.projectId,
      jobId: trial.jobId,
    });
    await markTrialEarlyStopped(connection, { trialId: trial.id, stopReason: stop.stopReason });
    await connection.query(
      'UPDATE runs SET tags=tags||jsonb_build_object($2::text,$3::text) WHERE id=$1',
      [trial.runId, SWEEP_EARLY_STOPPED_TAG, 'true'],
    );
  }

  private async launchTrials(connection: Connection, sweep: StoredSweep): Promise<void> {
    const trials = await listSweepTrials(connection, sweep.id);
    let activeCount = trials.filter((trial) => ACTIVE_TRIAL_STATES.includes(trial.state)).length;
    let nextIndex = trials.length;
    const isExhausted = () =>
      sweep.method === 'grid' && nextIndex >= countGridCombinations(sweep.searchSpace as SearchSpace);
    const canLaunch = () =>
      activeCount < sweep.parallelism && nextIndex < sweep.maxTrials && !isExhausted();
    if (canLaunch()) {
      const blocker = await this.launchBlocker(connection, sweep);
      if (blocker) return this.setStatus(connection, { sweep, status: 'paused', reason: blocker });
    }
    const pendingParameters = trials
      .filter((trial) => ACTIVE_TRIAL_STATES.includes(trial.state))
      .map((trial) => trial.parameters as TrialParameters);
    while (canLaunch()) {
      const parameters = this.suggest(sweep, { trials, trialIndex: nextIndex, pendingParameters });
      if (!parameters)
        return this.setStatus(connection, { sweep, status: 'failed', reason: 'suggestion_failed' });
      if (!(await this.launchTrial(connection, { sweep, trialIndex: nextIndex, parameters })))
        return this.setStatus(connection, { sweep, status: 'paused', reason: 'launch_failed' });
      pendingParameters.push(parameters);
      activeCount += 1;
      nextIndex += 1;
    }
    if (activeCount > 0) return;
    if (nextIndex >= sweep.maxTrials)
      return this.setStatus(connection, { sweep, status: 'finished', reason: 'max_trials_reached' });
    if (isExhausted())
      return this.setStatus(connection, {
        sweep,
        status: 'finished',
        reason: 'search_space_exhausted',
      });
  }

  private suggest(
    sweep: StoredSweep,
    request: { trials: SweepTrial[]; trialIndex: number; pendingParameters: TrialParameters[] },
  ): TrialParameters | null {
    const completedTrials: CompletedTrial[] = request.trials
      .filter((trial) => COMPLETED_TRIAL_STATES.has(trial.state))
      .map((trial) => ({
        parameters: trial.parameters as TrialParameters,
        objective: trial.objectiveValue,
        state: trial.state as CompletedTrial['state'],
      }));
    try {
      const suggestion = suggestTrial({
        space: sweep.searchSpace as SearchSpace,
        method: sweep.method,
        goal: sweep.objective.goal,
        seed: sweep.seed,
        trialIndex: request.trialIndex,
        completedTrials,
        pendingParameters: request.pendingParameters,
      });
      // gridを使い切ったことは提案の前に検出するので、正しいSweepではここに来ない。
      return 'parameters' in suggestion ? suggestion.parameters : null;
    } catch (error) {
      console.error(
        JSON.stringify({
          event: 'sweep_suggestion_failed',
          sweepId: sweep.id,
          message: error instanceof Error ? error.message : String(error),
        }),
      );
      return null;
    }
  }

  // Taskの起動が拒まれたら（無効なコンピュータ、削除された実験など）falseを返す。savepointにより、
  // このトランザクションで既に記録したtrialの結果は残る。
  private async launchTrial(
    connection: Connection,
    launch: { sweep: StoredSweep; trialIndex: number; parameters: TrialParameters },
  ): Promise<boolean> {
    const { sweep, trialIndex, parameters } = launch;
    await connection.query(`SAVEPOINT ${TRIAL_LAUNCH_SAVEPOINT}`);
    try {
      const task = await findTask(connection, { projectId: sweep.projectId, id: sweep.taskId });
      const suffix = `-${trialIndex}`;
      const execution = await this.tasks.launchTaskInTransaction(connection, {
        task,
        createdBy: sweep.createdBy,
        input: {
          executionMode: 'run',
          name: `${sweep.name.slice(0, RUN_NAME_LIMIT - suffix.length)}${suffix}`,
          parameters,
          ...(sweep.targetId ? { targetId: sweep.targetId } : {}),
          ...(sweep.gpuIds ? { gpuIds: sweep.gpuIds } : {}),
        },
        serverTags: { [SWEEP_ID_TAG]: sweep.id, [SWEEP_TRIAL_INDEX_TAG]: String(trialIndex) },
      });
      await insertTrial(connection, {
        sweepId: sweep.id,
        projectId: sweep.projectId,
        trialIndex,
        parameters,
        runId: execution.run.id,
        jobId: execution.job.id,
      });
    } catch (error) {
      await connection.query(`ROLLBACK TO SAVEPOINT ${TRIAL_LAUNCH_SAVEPOINT}`);
      console.error(
        JSON.stringify({
          event: 'sweep_trial_launch_failed',
          sweepId: sweep.id,
          trialIndex,
          code: error instanceof DomainError ? error.code : 'internal_error',
        }),
      );
      return false;
    }
    await connection.query(`RELEASE SAVEPOINT ${TRIAL_LAUNCH_SAVEPOINT}`);
    return true;
  }

  private async setStatus(
    connection: Connection,
    change: {
      sweep: StoredSweep;
      status: 'paused' | 'finished' | 'failed';
      reason: SweepStatusReason;
    },
  ): Promise<void> {
    await updateSweepStatus(connection, {
      id: change.sweep.id,
      status: change.status,
      statusReason: change.reason,
    });
  }
}

/** 目的の値を出した点のstep。目的の値が無ければnull。 */
function findObjectiveStep(
  history: readonly MetricPoint[],
  objective: { objectiveValue: number | null; aggregation: 'last' | 'min' | 'max' },
): number | null {
  if (objective.objectiveValue === null) return null;
  if (objective.aggregation === 'last')
    return history.reduce((latest, point) => Math.max(latest, point.step), -Infinity);
  return history.find((point) => point.value === objective.objectiveValue)?.step ?? null;
}
