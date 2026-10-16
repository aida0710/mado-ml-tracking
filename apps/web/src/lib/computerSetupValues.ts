import type {
  TargetCheck,
  TargetCheckDirectory,
  TargetCheckGpu,
  TargetCheckPython,
  TargetCheckResult,
} from '@mmt/contracts';
import type { FormValues } from '../types/form';
import { getFieldValue, splitLines, toggleValue } from './formValues';

// The host runner and the SDK need Python 3.11 (pyproject.toml's requires-python).
const MINIMUM_JOB_PYTHON: readonly [number, number] = [3, 11];

/** The worker reached the computer: its result's connection item passed. */
export function isConnectionReached(check: TargetCheck | undefined): boolean {
  return (
    check?.status === 'finished' &&
    check.result?.items.some((item) => item.name === 'connection' && item.status === 'ok') === true
  );
}

/** Pythons the check found. */
export function detectedPythons(result: TargetCheckResult | null | undefined): TargetCheckPython[] {
  return result?.pythons ?? [];
}

/** Directories the check found that could hold the work directory. */
export function detectedDirectories(
  result: TargetCheckResult | null | undefined,
): TargetCheckDirectory[] {
  return result?.directories ?? [];
}

export function detectedGpus(result: TargetCheckResult | null | undefined): TargetCheckGpu[] {
  return result?.gpus ?? [];
}

function meetsMinimumVersion(version: string | null): boolean {
  if (!version) return false;
  const [major = 0, minor = 0] = version.split('.').map(Number);
  const [minimumMajor, minimumMinor] = MINIMUM_JOB_PYTHON;
  return major > minimumMajor || (major === minimumMajor && minor >= minimumMinor);
}

/** The first Python the check found that Jobs can use (the worker lists PATH's python3 first). */
export function preferredPython(result: TargetCheckResult | null | undefined): string | null {
  return detectedPythons(result).find((python) => meetsMinimumVersion(python.version))?.path ?? null;
}

/** As many Jobs at once as the chosen GPUs, one per GPU; one on a CPU-only computer. */
export function defaultConcurrentJobs(gpuIds: readonly string[]): string {
  return String(Math.max(1, gpuIds.length));
}

/** `next` with the concurrency following its GPUs, when the GPUs changed from `previous`. */
export function withConcurrencyFollowingGpus(previous: FormValues, next: FormValues): FormValues {
  if (getFieldValue(next, 'gpuIds') === getFieldValue(previous, 'gpuIds')) return next;
  return { ...next, maxConcurrentJobs: defaultConcurrentJobs(formGpuIds(next)) };
}

/** GPU IDs of the form, one per line. */
export function formGpuIds(values: FormValues): string[] {
  return splitLines(getFieldValue(values, 'gpuIds'));
}

/** The form with a GPU added or removed; manually typed IDs stay. */
export function toggleGpuId(values: FormValues, gpuId: string): FormValues {
  return { ...values, gpuIds: toggleValue(formGpuIds(values), gpuId).join('\n') };
}

/**
 * A new computer's setup filled in from its check: the CPU it reported, the runtimes that worked,
 * every GPU it found (Jobs choose GPUs by nvidia-smi index), a usable Python when none is typed,
 * and as many Jobs at once as GPUs. What the check could not tell stays as it was.
 */
export function applyCheckToSetupValues(values: FormValues, result: TargetCheckResult): FormValues {
  const next = { ...values };
  if (result.host.cpuArch) next.cpuArch = result.host.cpuArch;
  if (result.runtimeKinds.length) next.runtimeKinds = [...result.runtimeKinds];
  if (result.gpus) {
    const gpuIds = result.gpus.map((gpu) => gpu.index);
    next.gpuIds = gpuIds.join('\n');
    next.maxConcurrentJobs = defaultConcurrentJobs(gpuIds);
  }
  const python = preferredPython(result);
  if (python && !getFieldValue(values, 'pythonExecutable')) next.pythonExecutable = python;
  return next;
}
