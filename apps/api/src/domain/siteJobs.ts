import type { ComputeTarget, JobPhase } from '@mmt/contracts';
import { DomainError } from './errors.js';

/** What a Job asks of a site beyond its runtime; ssh and local Jobs name exact GPU IDs instead. */
export interface SiteJobOptions {
  gpuCount: number;
  retryOnFailure: boolean;
  retryOnTimeout: boolean;
}

export function validateSiteJobOptions(
  target: Pick<ComputeTarget, 'executor'>,
  options: SiteJobOptions,
): void {
  if (target.executor === 'site') return;
  if (options.gpuCount > 0 || options.retryOnFailure || options.retryOnTimeout)
    throw new DomainError({
      status: 422,
      code: 'site_only_setting',
      message: 'gpuCount, retryOnFailure and retryOnTimeout are settings of site jobs only',
    });
}

/** A manual site's Jobs wait for `mado-tracking submit`; everything else starts without a phase. */
export function initialJobPhase(
  target: Pick<ComputeTarget, 'executor' | 'submissionMode'>,
): JobPhase | null {
  return target.executor === 'site' && target.submissionMode === 'manual' ? 'waiting_manual' : null;
}
