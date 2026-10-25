import type { RunKind } from '@mmt/contracts';
import { z } from 'zod';
import { DomainError } from './errors.js';
import { isRelativeFilePath, jsonObjectSchema, uuidSchema } from './validation.js';

// モデルバージョンはそれぞれ一致するすべての自動実行ルール（推論と評価のJob）を始めるので、
// コンテナがキューをあふれさせないようにする。学習Runが出力するのは少数のcheckpointや派生版だけ。
export const MAX_MODEL_DECLARATIONS = 16;
// データセットバージョンは参照の行だが、それぞれリクエストのトランザクションの中で登録する。
// 64個あれば分割ごと・言語ごとの出力をまかなえ、そのトランザクションも短く保てる。
export const MAX_DATASET_DECLARATIONS = 64;
// workerの出力パスの上限に合わせる（python/src/mado_tracking/worker/container_outputs.py）。
const MAX_OUTPUT_PATH_LENGTH = 1024;
// workerは/mmt/outputs/<path>を、この前置きを付けたRunのArtifactのパスに保存する。
const CONTAINER_ARTIFACT_PREFIX = 'container/';
const OUTPUT_MODEL_RUN_KINDS: readonly RunKind[] = ['training', 'finetuning'];

const outputPathSchema = z
  .string()
  .max(MAX_OUTPUT_PATH_LENGTH)
  .refine(
    (path) => isRelativeFilePath(path) && !/[\r\n]/.test(path),
    'Output path must be a relative file path inside /mmt/outputs',
  );

const declarationIndexSchema = z
  .number()
  .int()
  .min(0)
  .max(MAX_MODEL_DECLARATIONS + MAX_DATASET_DECLARATIONS - 1);

const modelDeclarationSchema = z.strictObject({
  index: declarationIndexSchema,
  kind: z.literal('model'),
  path: outputPathSchema,
  modelId: uuidSchema.optional(),
  metadata: jsonObjectSchema.default({}),
});

const datasetDeclarationShape = {
  index: declarationIndexSchema,
  kind: z.literal('dataset'),
  datasetId: uuidSchema,
  schema: jsonObjectSchema.default({}),
  metadata: jsonObjectSchema.default({}),
};
const datasetDeclarationSchema = z.union([
  z.strictObject({ ...datasetDeclarationShape, path: outputPathSchema }),
  z.strictObject({
    ...datasetDeclarationShape,
    uri: z.string().min(1).max(4000),
    digest: z.string().min(1).max(1000),
  }),
]);

// worker（leaseで）とsiteのrunner（インスタンスIDで）が共有する。
export const outputDeclarationsSchema = z
  .array(z.union([modelDeclarationSchema, datasetDeclarationSchema]))
  .min(1)
  .max(MAX_MODEL_DECLARATIONS + MAX_DATASET_DECLARATIONS)
  .refine(
    (declarations) =>
      new Set(declarations.map((declaration) => declaration.index)).size === declarations.length,
    'Declaration indexes must be unique',
  );

export const workerOutputsSchema = z.strictObject({
  version: z.literal(2),
  leaseId: uuidSchema,
  declarations: outputDeclarationsSchema,
});

export type WorkerOutputsInput = z.infer<typeof workerOutputsSchema>;
export type ParsedOutputDeclaration = WorkerOutputsInput['declarations'][number];
export type ModelOutputDeclaration = Extract<ParsedOutputDeclaration, { kind: 'model' }>;
export type DatasetOutputDeclaration = Extract<ParsedOutputDeclaration, { kind: 'dataset' }>;
export type DeclarationCounts = Record<ParsedOutputDeclaration['kind'], number>;

export function containerArtifactPath(outputPath: string): string {
  return `${CONTAINER_ARTIFACT_PREFIX}${outputPath}`;
}

export function countDeclarations(
  declarations: readonly Pick<ParsedOutputDeclaration, 'kind'>[],
): DeclarationCounts {
  const counts: DeclarationCounts = { model: 0, dataset: 0 };
  for (const declaration of declarations) counts[declaration.kind] += 1;
  return counts;
}

export function assertModelOutputsAllowed(run: { kind: RunKind }, counts: DeclarationCounts): void {
  if (counts.model > 0 && !OUTPUT_MODEL_RUN_KINDS.includes(run.kind))
    throw new DomainError({
      status: 422,
      code: 'output_model_kind',
      message: 'only training or finetuning runs can declare output models',
    });
}

// 上限はRun全体にかかるので、workerがリクエストを分けて上限を超えることはできない。
export function assertDeclarationLimits(counts: DeclarationCounts): void {
  if (counts.model > MAX_MODEL_DECLARATIONS || counts.dataset > MAX_DATASET_DECLARATIONS)
    throw new DomainError({
      status: 422,
      code: 'output_declaration_limit',
      message: `a run can declare at most ${MAX_MODEL_DECLARATIONS} model outputs and ${MAX_DATASET_DECLARATIONS} dataset outputs`,
      details: { modelLimit: MAX_MODEL_DECLARATIONS, datasetLimit: MAX_DATASET_DECLARATIONS },
    });
}

/**
 * Taskの出力モデルを優先する。別のModelを指定した宣言は拒む。どのModelがRunの出力を持つのか、
 * 読む人に分からなくなるため。Taskに設定が無ければ、コンテナ自身がModelを指定しなければならない。
 */
export function chooseOutputModelId(choice: {
  declaredModelId: string | undefined;
  taskModelId: string | null;
}): string {
  const { declaredModelId, taskModelId } = choice;
  if (taskModelId) {
    if (declaredModelId && declaredModelId !== taskModelId)
      throw new DomainError({
        status: 422,
        code: 'output_model_conflict',
        message: 'a model other than the output model of the task cannot be declared',
      });
    return taskModelId;
  }
  if (!declaredModelId)
    throw new DomainError({
      status: 422,
      code: 'output_model_required',
      message: 'a run whose task has no output model setting requires modelId in the declaration',
    });
  return declaredModelId;
}
