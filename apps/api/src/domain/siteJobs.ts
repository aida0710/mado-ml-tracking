import type { ComputeTarget, JobPhase } from '@mmt/contracts';
import { DomainError } from './errors.js';

/** Jobがruntimeのほかにsiteへ求めるもの。sshとlocalのJobは代わりに具体的なGPU IDを指定する。 */
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

/** 手動のsiteのJobは`mado-tracking submit`を待つ。それ以外はphaseなしで始まる。 */
export function initialJobPhase(
  target: Pick<ComputeTarget, 'executor' | 'submissionMode'>,
): JobPhase | null {
  return target.executor === 'site' && target.submissionMode === 'manual' ? 'waiting_manual' : null;
}
