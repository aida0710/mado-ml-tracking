import type { RunKind } from './index.js';

/** Run kinds that train weights and can record checkpoints and training data changes. */
export const TRAINING_RUN_KINDS = ['training', 'finetuning'] as const;

export function isTrainingRunKind(kind: RunKind): boolean {
  return (TRAINING_RUN_KINDS as readonly RunKind[]).includes(kind);
}
