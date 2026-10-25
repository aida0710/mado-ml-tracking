import type { Run, RunOutputRegistration, RunStatus } from '@mmt/contracts';

const TERMINAL_RUN_STATUSES: readonly RunStatus[] = ['finished', 'failed', 'canceled'];
export const isTerminalRun = (run: Pick<Run, 'status'>) => TERMINAL_RUN_STATUSES.includes(run.status);

export type RunOutputRegistrationState =
  | { kind: 'none' }
  | { kind: 'pending' }
  | { kind: 'registered' | 'skipped'; modelVersionId: string }
  | { kind: 'failed'; error: string };

/** Task側の登録についてRunのページに出すもの。Runが終わった時点でAPIが決める。 */
export function getRunOutputRegistrationState(
  run: Pick<Run, 'status' | 'outputModelRegistration'>,
  registration: RunOutputRegistration | null | undefined,
): RunOutputRegistrationState {
  if (registration?.status === 'failed') return { kind: 'failed', error: registration.error ?? '' };
  if (registration?.modelVersionId) return { kind: registration.status === 'skipped' ? 'skipped' : 'registered',
    modelVersionId: registration.modelVersionId };
  if (run.outputModelRegistration && !isTerminalRun(run)) return { kind: 'pending' };
  return { kind: 'none' };
}
