import {
  MAX_JOB_ARRAY_SIZE,
  MAX_JOB_GPU_COUNT,
  MAX_JOB_WALLTIME_SECONDS,
  MAX_QUEUE_TIMEOUT_SECONDS,
  MIN_QUEUE_TIMEOUT_SECONDS,
  type ComputeTarget,
} from '@mmt/contracts';
import type { CreateJob } from '../api/inputs';
import type { FormValues } from '../types/form';
import { getFieldValue, getSelectedValues } from './formValues';
import { parseMaxAttempts } from './executionValidation';
import { parseClockDuration } from './clockDuration';
import { validateTargetGpuIds } from './runtimeValidation';
import { LocalizedError } from './localizedError';
import { text } from '../i18n/catalog';
import { computeTextTemplates } from '../i18n/compute';
import { jobsTextTemplates } from '../i18n/jobs';

const SECONDS_PER_MINUTE = 60;
const SECONDS_PER_DAY = 24 * 60 * 60;

/**
 * siteはGPU数と制限時間を受け取り、job shellがそれをスケジューラへ渡す。sshとlocalの
 * コンピュータは、workerがホストで確保するGPU IDを受け取る。
 */
export const isSiteTarget = (target: Pick<ComputeTarget, 'executor'> | undefined): boolean =>
  target?.executor === 'site';

/** siteのJobが求めるGPU数。空か0ならCPUだけで動く。 */
export function parseGpuCount(value: string): number {
  const trimmed = value.trim();
  const count = trimmed ? Number(trimmed) : 0;
  if (!Number.isSafeInteger(count) || count < 0 || count > MAX_JOB_GPU_COUNT)
    throw new Error(text.gpuCountError);
  return count;
}

/** siteのJobの制限時間（秒）。空なら制限をsiteのjob shellに任せる。 */
export function parseWalltime(value: string): number | null {
  const seconds = parseClockDuration(value);
  if (seconds !== null && (seconds <= 0 || seconds > MAX_JOB_WALLTIME_SECONDS))
    throw new LocalizedError(() => jobsTextTemplates.walltimeError(MAX_JOB_WALLTIME_SECONDS / SECONDS_PER_DAY));
  return seconds;
}

/** siteのJobがスケジューラのキューで待てる時間。過ぎると失敗する。空なら制限しない。 */
export function parseQueueTimeout(value: string): number | null {
  const seconds = parseClockDuration(value);
  if (
    seconds !== null &&
    (seconds < MIN_QUEUE_TIMEOUT_SECONDS || seconds > MAX_QUEUE_TIMEOUT_SECONDS)
  )
    throw new LocalizedError(() =>
      computeTextTemplates.queueTimeoutError(
        MIN_QUEUE_TIMEOUT_SECONDS / SECONDS_PER_MINUTE,
        MAX_QUEUE_TIMEOUT_SECONDS / SECONDS_PER_DAY,
      ),
    );
  return seconds;
}

/** Jobのarrayの個数。空なら単独のJobを1つ始める。 */
export function parseArraySize(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const size = Number(trimmed);
  if (!Number.isSafeInteger(size) || size < 1 || size > MAX_JOB_ARRAY_SIZE)
    throw new Error(text.arraySizeError);
  return size;
}

/** Jobがコンピュータに求めるもの。ssh/localのコンピュータではGPU ID、siteではGPU数と制限時間。 */
export type JobResourceInput =
  | { gpuIds: string[] }
  | { gpuCount: number; walltimeSeconds: number | null };

/**
 * フォームの欄gpuIds・gpuCount・walltimeから作る、Jobの要求の資源の項目。APIはsiteでのGPU ID
 * （site_gpu_ids）と、site以外でのGPU数（site_only_setting）を拒否するので、そのコンピュータの
 * 種類に合う項目だけを送る。
 */
export function buildJobResources(target: ComputeTarget, values: FormValues): JobResourceInput {
  const gpuIds = getSelectedValues(values, 'gpuIds');
  if (!isSiteTarget(target)) {
    validateTargetGpuIds(target, gpuIds);
    return { gpuIds };
  }
  if (gpuIds.length) throw new Error(text.siteGpuIdsError);
  return {
    gpuCount: parseGpuCount(getFieldValue(values, 'gpuCount')),
    walltimeSeconds: parseWalltime(getFieldValue(values, 'walltime')),
  };
}

const isChecked = (values: FormValues, name: string) => getFieldValue(values, name) === 'true';

/**
 * 起動フォームから作るRunのJobの要求。自動の再試行はsiteにだけあり、任意で有効にするフラグは
 * 有効なときだけ送るので、sshのJobはsiteができる前とまったく同じ要求になる。
 */
export function buildJobRequest(target: ComputeTarget, values: FormValues): Omit<CreateJob, 'runId'> {
  const isSite = isSiteTarget(target);
  return {
    targetId: target.id,
    maxAttempts: parseMaxAttempts(getFieldValue(values, 'maxAttempts')),
    ...buildJobResources(target, values),
    ...(isSite && isChecked(values, 'retryOnFailure') && { retryOnFailure: true }),
    ...(isSite && isChecked(values, 'retryOnTimeout') && { retryOnTimeout: true }),
    ...(isChecked(values, 'allowChildJobs') && { allowChildJobs: true }),
  };
}
