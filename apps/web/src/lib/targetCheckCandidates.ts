import type { ComputeTarget, ExecutionRuntimeKind, TargetCheck } from '@mmt/contracts';

export interface TargetCandidates {
  gpuIds: string[];
  runtimeKinds: ExecutionRuntimeKind[];
}

// JobはGPUをnvidia-smiのインデックス（CUDA_VISIBLE_DEVICES）で選ぶ。target.gpuIdsと同じID。
export function detectedCandidates(check: TargetCheck): TargetCandidates | null {
  if (check.status !== 'finished' || !check.result) return null;
  return {
    gpuIds: (check.result.gpus ?? []).map((gpu) => gpu.index),
    runtimeKinds: check.result.runtimeKinds,
  };
}

export function hasCandidateChanges(target: ComputeTarget, selected: TargetCandidates): boolean {
  const sameMembers = (left: readonly string[], right: readonly string[]) =>
    left.length === right.length && left.every((value) => right.includes(value));
  return (
    !sameMembers(target.gpuIds, selected.gpuIds) ||
    !sameMembers(target.runtimeKinds, selected.runtimeKinds)
  );
}

export function isCheckInProgress(check: TargetCheck | undefined): boolean {
  return check?.status === 'queued' || check?.status === 'claimed';
}
