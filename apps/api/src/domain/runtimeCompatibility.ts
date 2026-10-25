import { isDeepStrictEqual } from 'node:util';
import type { ComputeTarget, ExecutionRuntime, ExecutionRuntimeKind, JsonValue } from '@mmt/contracts';
import { DomainError } from './errors.js';

// A site's runner converts a docker image to a SIF itself (apptainer pull), so docker Code
// also runs on a site that has only Apptainer or Singularity.
const SIF_RUNTIME_KINDS: readonly ExecutionRuntimeKind[] = ['singularity', 'apptainer'];

export function targetRunsRuntime(
  target: Pick<ComputeTarget, 'executor' | 'runtimeKinds'>,
  kind: ExecutionRuntimeKind,
): boolean {
  if (target.runtimeKinds.includes(kind)) return true;
  return (
    target.executor === 'site' &&
    kind === 'docker' &&
    target.runtimeKinds.some((available) => SIF_RUNTIME_KINDS.includes(available))
  );
}

export function validatePinnedRuntime(
  runtime: ExecutionRuntime,
  snapshot: JsonValue | undefined,
): void {
  if (!isDeepStrictEqual(runtime, snapshot))
    throw new DomainError({
      status: 422,
      code: 'runtime_mismatch',
      message: 'the pinned runtime of the run does not match the code version',
    });
}

export function validateTargetCompatibility(
  target: ComputeTarget,
  execution: {
    runtime: ExecutionRuntime;
    gpuIds: string[];
    allowLocalExecutor: boolean;
  },
): void {
  if (!targetRunsRuntime(target, execution.runtime.kind))
    throw new DomainError({
      status: 422,
      code: 'incompatible_runtime',
      message: 'the computer does not support the runtime',
    });
  if (target.executor === 'site') {
    // The site's scheduler or runner picks the GPUs; a Job asks only for how many (gpuCount).
    if (execution.gpuIds.length)
      throw new DomainError({
        status: 422,
        code: 'site_gpu_ids',
        message: 'GPU IDs cannot be specified for a site (specify the number with gpuCount)',
      });
    return;
  }
  if (target.executor === 'local' && !execution.allowLocalExecutor)
    throw new DomainError({
      status: 422,
      code: 'local_executor_disabled',
      message: 'the local executor is disabled',
    });
  if (execution.gpuIds.some((gpu) => !target.gpuIds.includes(gpu)))
    throw new DomainError({
      status: 422,
      code: 'unknown_gpu',
      message: 'a GPU that the computer does not have is specified',
    });
}
