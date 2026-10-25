import type { RunKind } from './index.js';

/** 重みを学習し、checkpointと学習データの変更を記録できるRunの種類。 */
export const TRAINING_RUN_KINDS = ['training', 'finetuning'] as const;

export function isTrainingRunKind(kind: RunKind): boolean {
  return (TRAINING_RUN_KINDS as readonly RunKind[]).includes(kind);
}
