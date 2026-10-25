import type {
  TargetCheck,
  TargetCheckDirectory,
  TargetCheckGpu,
  TargetCheckPython,
  TargetCheckResult,
} from '@mmt/contracts';
import type { FormValues } from '../types/form';
import { getFieldValue, splitLines, toggleValue } from './formValues';

// ホストのランナーとSDKにはPython 3.11が要る（pyproject.tomlのrequires-python）。
const MINIMUM_JOB_PYTHON: readonly [number, number] = [3, 11];

/** workerがコンピュータにつながった。結果の接続の項目が成功している。 */
export function isConnectionReached(check: TargetCheck | undefined): boolean {
  return (
    check?.status === 'finished' &&
    check.result?.items.some((item) => item.name === 'connection' && item.status === 'ok') === true
  );
}

/** 確認で見つかったPython。 */
export function detectedPythons(result: TargetCheckResult | null | undefined): TargetCheckPython[] {
  return result?.pythons ?? [];
}

/** 確認で見つかった、作業ディレクトリを置けそうなディレクトリ。 */
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

/** 確認で見つかったPythonのうち、Jobが使える最初のもの（workerはPATHのpython3を先頭に挙げる）。 */
export function preferredPython(result: TargetCheckResult | null | undefined): string | null {
  return detectedPythons(result).find((python) => meetsMinimumVersion(python.version))?.path ?? null;
}

/** 同時に動かすJobの数。選んだGPUの数（GPUごとに1つ）で、CPUだけのコンピュータでは1。 */
export function defaultConcurrentJobs(gpuIds: readonly string[]): string {
  return String(Math.max(1, gpuIds.length));
}

/** GPUが`previous`から変わったとき、同時実行数をGPUに合わせた`next`。 */
export function withConcurrencyFollowingGpus(previous: FormValues, next: FormValues): FormValues {
  if (getFieldValue(next, 'gpuIds') === getFieldValue(previous, 'gpuIds')) return next;
  return { ...next, maxConcurrentJobs: defaultConcurrentJobs(formGpuIds(next)) };
}

/** フォームのGPUのID。1行に1つ。 */
export function formGpuIds(values: FormValues): string[] {
  return splitLines(getFieldValue(values, 'gpuIds'));
}

/** GPUを足すか外したフォーム。手で入力したIDは残す。 */
export function toggleGpuId(values: FormValues, gpuId: string): FormValues {
  return { ...values, gpuIds: toggleValue(formGpuIds(values), gpuId).join('\n') };
}

/**
 * 確認の結果で埋めた新しいコンピュータの設定。報告されたCPU、動いたランタイム、見つかった
 * すべてのGPU（JobはGPUをnvidia-smiの番号で選ぶ）、未入力なら使えるPython、GPUと同じ数の
 * 同時実行数。確認で分からなかったものは元のまま。
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
