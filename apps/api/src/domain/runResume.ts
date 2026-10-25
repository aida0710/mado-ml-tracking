import {
  RUN_RESUME_REASON_MAX_LENGTH,
  type RunResumeEvent,
  type RunSegment,
  type RunStatus,
} from '@mmt/contracts';
import { z } from 'zod';
import { DomainError } from './errors.js';
import { isTerminalStatus } from './runTransitions.js';

/**
 * 終わったRunを開き直し、あとの記録が同じRunに続くようにするときの規則。MLflowの
 * start_run(run_id=)と同じ動き。ネイティブのresumeとMLflowのupdate-run RUNNINGで共有する。
 */

export const runResumeRequestSchema = z.strictObject({
  reason: z.string().max(RUN_RESUME_REASON_MAX_LENGTH).optional(),
});

/** 空白だけの理由は理由なしと同じに扱い、イベントに空文字列を保存しない。 */
export function storedResumeReason(reason: string | undefined): string | null {
  return reason?.trim() || null;
}

export interface ResumableRun {
  status: RunStatus;
  lifecycleStage: 'active' | 'deleted';
  startedAt: string | null;
}

export type RunResumeDecision =
  { resume: true; previousStatus: 'finished' | 'failed' | 'canceled' } | { resume: false };

/**
 * 再開は、実際にあった実行中の区間を開き直す。始まる前に取り消したRunには続ける区間が無いので、
 * runningにするのは最初の開始で、再開ではない。
 */
export function isResumeTransition(
  run: Pick<ResumableRun, 'status' | 'startedAt'>,
  nextStatus: RunStatus,
): boolean {
  return isTerminalStatus(run.status) && run.startedAt !== null && nextStatus === 'running';
}

export function decideRunResume(
  run: ResumableRun,
  context: { hasJob: boolean },
): RunResumeDecision {
  if (run.lifecycleStage === 'deleted')
    throw new DomainError({
      status: 409,
      code: 'run_deleted',
      message: 'a deleted run cannot be resumed',
    });
  if (run.status === 'running') return { resume: false };
  if (!isTerminalStatus(run.status) || run.startedAt === null)
    throw new DomainError({
      status: 409,
      code: 'run_not_started',
      message: 'a run that has not started cannot be resumed',
    });
  // Jobのライフサイクルはworkerが持ち、終わったRunは自動実行と評価の根拠になる。
  if (context.hasJob)
    throw new DomainError({
      status: 409,
      code: 'run_finalized',
      message: 'a run whose job has ended cannot be resumed; resume from a checkpoint as a new run',
    });
  return { resume: true, previousStatus: run.status };
}

/** Runを実行中の区間に分ける。eventsはresumedAtの順に並んでいる必要がある。 */
export function buildRunSegments(
  run: { status: RunStatus; startedAt: string; endedAt: string | null },
  events: readonly Pick<
    RunResumeEvent,
    'resumedAt' | 'previousStatus' | 'previousEndedAt' | 'maxStepAtResume'
  >[],
): RunSegment[] {
  const currentEnd = {
    endedAt: run.endedAt,
    endStatus: isTerminalStatus(run.status) ? run.status : null,
  };
  const endOfSegment = (index: number) => {
    const next = events[index];
    return next ? { endedAt: next.previousEndedAt, endStatus: next.previousStatus } : currentEnd;
  };
  const segments: RunSegment[] = [
    { startedAt: run.startedAt, ...endOfSegment(0), firstStep: null },
  ];
  events.forEach((event, index) => {
    segments.push({
      startedAt: event.resumedAt,
      ...endOfSegment(index + 1),
      firstStep: event.maxStepAtResume === null ? null : event.maxStepAtResume + 1,
    });
  });
  return segments;
}
