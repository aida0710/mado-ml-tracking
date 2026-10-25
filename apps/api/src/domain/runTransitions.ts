import type { RunStatus } from '@mmt/contracts';
import { conflict } from './errors.js';

export function isTerminalStatus(status: string): status is 'finished' | 'failed' | 'canceled' {
  return status === 'finished' || status === 'failed' || status === 'canceled';
}

export function validateRunTransition(current: RunStatus, next: RunStatus): void {
  if (current === next) return;
  if (isTerminalStatus(current) || next === 'queued')
    conflict(`the run status cannot change from ${current} to ${next}`, { from: current, to: next });
}
