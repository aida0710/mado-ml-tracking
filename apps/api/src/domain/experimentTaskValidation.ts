import type { TaskOutputModel } from '@mmt/contracts';
import { z } from 'zod';
import {
  executionModeSchema,
  gpuCountSchema,
  gpuIdsSchema,
  isRelativeFilePath,
  jsonObjectSchema,
  nameSchema,
  runKindSchema,
  tagsSchema,
  uniqueIdsSchema,
  uuidSchema,
  walltimeSecondsSchema,
} from './validation.js';
import { isValidVersionTemplate } from './outputModelVersionTemplate.js';

// PostgreSQLはTaskのrevisionをintegerで持つ。クライアントから来たrevisionを丸めない。
export const MAX_TASK_REVISION = 2_147_483_647;
const revisionSchema = z.number().int().min(1).max(MAX_TASK_REVISION);
// ポーリングと履歴の移動の負荷を抑えつつ、より大きなページの要求も許す。
export const DEFAULT_TASK_HISTORY_LIMIT = 50;
export const MAX_TASK_HISTORY_LIMIT = 200;
// Artifactのパスは、artifactsテーブルのMLflowのArtifactのパスと同じ上限で保存する。
const MAX_OUTPUT_ARTIFACT_PATH_LENGTH = 1000;
const outputModelSchema = z
  .strictObject({
    modelId: uuidSchema.nullable().default(null),
    createModel: z.strictObject({ name: nameSchema, family: nameSchema }).nullable().default(null),
    artifactPath: z
      .string()
      .max(MAX_OUTPUT_ARTIFACT_PATH_LENGTH)
      .refine(isRelativeFilePath, 'artifactPath must be a relative file path'),
    versionTemplate: z
      .string()
      .max(200)
      .refine(isValidVersionTemplate, 'versionTemplate needs a known placeholder')
      .optional(),
    defaultCodeVersionId: uuidSchema.nullable().default(null),
    metadata: jsonObjectSchema.default({}),
  })
  .refine((output) => (output.modelId === null) !== (output.createModel === null), {
    message: 'Specify exactly one of modelId and createModel',
    path: ['modelId'],
  });

const taskFields = {
  name: nameSchema,
  description: z.string().max(20000),
  kind: runKindSchema,
  codeVersionId: uuidSchema,
  modelVersionId: uuidSchema.nullable(),
  inputDatasetVersionIds: uniqueIdsSchema,
  parameters: jsonObjectSchema,
  tags: tagsSchema,
  targetId: uuidSchema.nullable(),
  gpuIds: gpuIdsSchema,
  // siteでの起動は、GPUのIDでなくGPUの数と制限時間を求める。
  gpuCount: gpuCountSchema,
  walltimeSeconds: walltimeSecondsSchema.nullable(),
  outputModel: outputModelSchema.nullable(),
};

export const taskCreateSchema = z.strictObject({
  ...taskFields,
  experimentId: uuidSchema,
  description: taskFields.description.default(''),
  modelVersionId: taskFields.modelVersionId.default(null),
  inputDatasetVersionIds: taskFields.inputDatasetVersionIds.default([]),
  parameters: taskFields.parameters.default({}),
  tags: taskFields.tags.default({}),
  targetId: taskFields.targetId.default(null),
  gpuIds: taskFields.gpuIds.default([]),
  gpuCount: taskFields.gpuCount.default(0),
  walltimeSeconds: taskFields.walltimeSeconds.default(null),
  outputModel: taskFields.outputModel.default(null),
});
export const taskPatchSchema = z.strictObject(taskFields).partial().extend({
  expectedRevision: revisionSchema,
});
export const taskLaunchSchema = z.strictObject({
  expectedRevision: revisionSchema,
  executionMode: executionModeSchema.default('run'),
  targetId: uuidSchema.optional(),
  gpuIds: gpuIdsSchema.optional(),
  gpuCount: gpuCountSchema.optional(),
  walltimeSeconds: walltimeSecondsSchema.nullable().optional(),
  name: nameSchema.optional(),
  parameters: jsonObjectSchema.optional(),
  modelVersionId: uuidSchema.nullable().optional(),
  inputDatasetVersionIds: uniqueIdsSchema.optional(),
  // 学習・ファインチューニングの起動を、保存したcheckpointから続ける（Codeと種類が同じもの）。
  resumeCheckpointId: uuidSchema.optional(),
});
export const taskHistoryQuerySchema = z.strictObject({
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(MAX_TASK_HISTORY_LIMIT)
    .default(DEFAULT_TASK_HISTORY_LIMIT),
  cursor: uuidSchema.optional(),
});

export type TaskCreate = z.infer<typeof taskCreateSchema>;
// Taskに保存した起動の既定値。作成のリクエストから来たものも、更新した行から来たものも同じ形。
export type TaskDefaults = Omit<TaskCreate, 'experimentId' | 'outputModel'> & {
  outputModel: TaskOutputModel | null;
};
export type TaskPatch = z.infer<typeof taskPatchSchema>;
export type TaskLaunch = z.infer<typeof taskLaunchSchema>;
export type TaskHistoryQuery = z.infer<typeof taskHistoryQuerySchema>;
