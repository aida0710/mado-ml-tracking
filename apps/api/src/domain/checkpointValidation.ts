import {
  MLFLOW_CHECKPOINT_PATH_PREFIX,
  TRAINING_RUN_KINDS,
  isTrainingRunKind,
  type RunCheckpointFile,
  type RunKind,
} from '@mmt/contracts';
import { z } from 'zod';
import { DomainError } from './errors.js';
import { isSafeArtifactPath } from '../mlflow/artifacts/artifactPath.js';
import { jsonObjectSchema, uuidSchema } from './validation.js';

/** checkpointを保存し、そこから続けるのは重みを学習するRunだけ。 */
export const CHECKPOINT_RUN_KINDS: readonly RunKind[] = TRAINING_RUN_KINDS;
// checkpointのディレクトリはモデルの重みと少数の状態ファイル。manifestの行の大きさをこれで抑える。
export const MAX_CHECKPOINT_FILES = 10000;
// metadataは小さな説明（epoch、lossなど）で、学習の状態を置く場所ではない。
const MAX_CHECKPOINT_METADATA_BYTES = 64 * 1024;
const MAX_FRAMEWORK_LENGTH = 100;

const checkpointFileSchema = z.strictObject({
  path: z.string().refine(isSafeArtifactPath, 'A safe relative path is required'),
  sha256: z.string().regex(/^[a-f0-9]{64}$/, 'A SHA256 digest is required'),
  size: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
});

const stepSchema = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);

export const runCheckpointCreateSchema = z.strictObject({
  step: stepSchema,
  artifactId: uuidSchema,
  manifest: z.strictObject({
    files: z
      .array(checkpointFileSchema)
      .min(1)
      .max(MAX_CHECKPOINT_FILES)
      .refine(hasUniquePaths, 'Checkpoint file paths must be unique'),
    includesOptimizer: z.boolean().default(false),
    framework: z.string().trim().min(1).max(MAX_FRAMEWORK_LENGTH).nullish(),
  }),
  metadata: jsonObjectSchema
    .refine(
      (metadata) => Buffer.byteLength(JSON.stringify(metadata)) <= MAX_CHECKPOINT_METADATA_BYTES,
      'Checkpoint metadata is too large',
    )
    .default({}),
});
export type RunCheckpointCreateInput = z.infer<typeof runCheckpointCreateSchema>;

export const runCheckpointListQuerySchema = z.strictObject({
  includeHidden: z.enum(['true', 'false']).default('false'),
});

export const jobRetryRequestSchema = z
  .strictObject({
    checkpointId: uuidSchema.optional(),
    resumeFromLatestCheckpoint: z.boolean().optional(),
  })
  .refine(
    (request) => !(request.checkpointId && request.resumeFromLatestCheckpoint),
    'Specify either checkpointId or resumeFromLatestCheckpoint',
  );
export type JobRetryInput = z.infer<typeof jobRetryRequestSchema>;

function hasUniquePaths(files: readonly RunCheckpointFile[]): boolean {
  return new Set(files.map((file) => file.path)).size === files.length;
}

/**
 * checkpoints/step-12/model/weights.ptのような、MLflowのRunのArtifactのパスを、stepと
 * checkpointのディレクトリ内のパスに分ける。それ以外のパスはnull。
 */
export function parseMlflowCheckpointPath(
  path: string,
): { step: number; relativePath: string } | null {
  if (!path.startsWith(MLFLOW_CHECKPOINT_PATH_PREFIX)) return null;
  const match = /^(0|[1-9][0-9]*)\/(.+)$/.exec(path.slice(MLFLOW_CHECKPOINT_PATH_PREFIX.length));
  if (!match) return null;
  const step = Number(match[1]);
  if (!Number.isSafeInteger(step)) return null;
  return { step, relativePath: match[2]! };
}

export function assertCheckpointRunKind(kind: RunKind): void {
  if (!isTrainingRunKind(kind))
    throw new DomainError({
      status: 422,
      code: 'checkpoint_run_kind',
      message: 'checkpoints can be registered only on training or finetuning runs',
    });
}

/**
 * Runがcheckpointから続けられるのは、同じ種類の重みを同じCode（バージョンは問わない）の
 * コードで学習するときだけ。種類やコードが違うと、ファイルの読み方が変わる。
 */
export function assertResumableFrom(
  checkpointRun: { kind: RunKind; codeId: string | null },
  run: { kind: RunKind; codeId: string | null },
): void {
  if (!isTrainingRunKind(run.kind) || run.kind !== checkpointRun.kind)
    throw new DomainError({
      status: 422,
      code: 'checkpoint_kind_mismatch',
      message: 'a checkpoint can be resumed only in a run of the same kind as its original run (training or finetuning)',
    });
  if (!checkpointRun.codeId || checkpointRun.codeId !== run.codeId)
    throw new DomainError({
      status: 422,
      code: 'checkpoint_code_mismatch',
      message: 'resume a checkpoint with the same code version as its original run',
    });
}
