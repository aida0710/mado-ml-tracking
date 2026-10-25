import type { Run, RunStatus } from './index.js';

export type RunResumeSource = 'native' | 'mlflow' | 'sync';

/**
 * 終了したRunを1回開き直したこと。previousStatus/previousEndedAtは直前に終わった区間を表し、
 * maxStepAtResumeはそれまでに記録したメトリクスの最大のstep（メトリクスが無ければnull）。
 */
export interface RunResumeEvent {
  id: string;
  runId: string;
  resumedAt: string;
  previousStatus: 'finished' | 'failed' | 'canceled';
  previousEndedAt: string | null;
  maxStepAtResume: number | null;
  source: RunResumeSource;
  actorUserId: string | null;
  reason: string | null;
}

export interface RunResumeRequest {
  reason?: string;
}

/** resumed=falseはRunが既に実行中だったこと。何も変わらず、eventはnull。 */
export interface RunResumeResult {
  run: Run;
  resumed: boolean;
  event: RunResumeEvent | null;
  // メトリクスキーごとの最大のstep。クライアントは次のstepから続けられる。
  lastSteps: Record<string, number>;
}

/**
 * Runの実行期間の1区間。最初の区間はRun.startedAtに始まり、firstStep=null。後の区間はそれぞれ
 * 再開のイベントで始まる。区間の実行中はendedAt/endStatusがnull。
 */
export interface RunSegment {
  startedAt: string;
  endedAt: string | null;
  endStatus: RunStatus | null;
  firstStep: number | null;
}

export interface RunResumeEventPage {
  items: RunResumeEvent[];
  segments: RunSegment[];
}

export const RUN_RESUME_REASON_MAX_LENGTH = 2000;
