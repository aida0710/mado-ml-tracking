import { z } from 'zod';
import { containsControlCharacter, MAX_DATASET_VERSION_FILES } from '@mmt/contracts';
import {
  externalDatasetRefSchema,
  isRelativeFilePath,
  jsonObjectSchema,
  nameSchema,
  uniqueIdsSchema,
  uuidSchema,
} from './validation.js';

// 保存するArtifactのパスと同じ上限（artifactRegistration）なので、どのArtifactのパスも収まる。
const MAX_DATASET_FILE_PATH_LENGTH = 1024;
// cursorはパスを1つ持つJSONをbase64urlにしたものなので、数KBに収まる。
const MAX_CURSOR_LENGTH = 4096;
// ファイル一覧の1ページ。画面のツリーは1ページに1階層のディレクトリを出す。
const DEFAULT_FILE_PAGE_LIMIT = 1000;
const MAX_FILE_PAGE_LIMIT = 1000;
// 制御文字を含むパスは、workerのホストに書くのも画面に出すのも危ない。

export function isDatasetFilePath(path: string): boolean {
  return (
    path.length <= MAX_DATASET_FILE_PATH_LENGTH &&
    isRelativeFilePath(path) &&
    !containsControlCharacter(path)
  );
}

const datasetFilePathSchema = z
  .string()
  .refine(isDatasetFilePath, 'A relative file path without `.`/`..` segments is required');

// ディレクトリの前置き。ルートは''、それ以外は安全な相対パス（末尾の`/`はあってもなくてもよい）。
const directoryPrefixSchema = z
  .string()
  .max(MAX_DATASET_FILE_PATH_LENGTH)
  .refine((prefix) => prefix === '' || isDatasetFilePath(prefix.replace(/\/$/, '')), 'Invalid prefix')
  .default('');

const datasetFilesContentSchema = z.strictObject({
  kind: z.literal('artifacts'),
  files: z
    .array(z.strictObject({ path: datasetFilePathSchema, artifactId: uuidSchema }))
    .min(1)
    .max(MAX_DATASET_VERSION_FILES)
    .refine(
      (files) => new Set(files.map((file) => file.path)).size === files.length,
      'File paths must be unique',
    ),
});

const runArtifactsContentSchema = z.strictObject({
  kind: z.literal('artifacts'),
  fromRunArtifacts: z.strictObject({ runId: uuidSchema, prefix: directoryPrefixSchema }),
});

export const datasetVersionContentSchema = z.union([
  datasetFilesContentSchema,
  runArtifactsContentSchema,
]);
export type DatasetVersionContentInput = z.infer<typeof datasetVersionContentSchema>;

/**
 * POST /projects/:p/datasets/:d/versions。contentが無ければ参照型のバージョンを登録する
 * （version・uri・digestが必須）。contentがあればサーバーがuriを決めてdigestを計算する。
 * それでもdigestを送るなら計算結果と一致する必要があり、versionを省くと次の整数になる。
 */
export const datasetVersionRequestSchema = z
  .strictObject({
    version: nameSchema.optional(),
    uri: z.string().min(1).max(4000).optional(),
    digest: z.string().min(1).max(1000).optional(),
    schema: jsonObjectSchema.default({}),
    metadata: jsonObjectSchema.default({}),
    sourceRunId: uuidSchema.nullish(),
    parentDatasetVersionIds: uniqueIdsSchema.default([]),
    externalRef: externalDatasetRefSchema.nullish(),
    content: datasetVersionContentSchema.optional(),
  })
  .superRefine((request, context) => {
    const required = request.content ? [] : (['version', 'uri', 'digest'] as const);
    for (const key of required)
      if (request[key] === undefined)
        context.addIssue({ code: 'custom', path: [key], message: `${key} is required` });
    // Artifactのバージョンのuriはサーバーが決め、pluginからの取り込みは参照型のバージョンになる。
    const forbidden = request.content ? (['uri', 'externalRef'] as const) : [];
    for (const key of forbidden)
      if (request[key] != null)
        context.addIssue({ code: 'custom', path: [key], message: `${key} is set by the server` });
  });
export type DatasetVersionRequest = z.infer<typeof datasetVersionRequestSchema>;

export const datasetFileListQuerySchema = z.object({
  prefix: directoryPrefixSchema,
  delimiter: z.literal('/').optional(),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(MAX_FILE_PAGE_LIMIT)
    .default(DEFAULT_FILE_PAGE_LIMIT),
  cursor: z.string().max(MAX_CURSOR_LENGTH).optional(),
});
export type DatasetFileListQuery = z.infer<typeof datasetFileListQuerySchema>;

export const datasetFileTreeQuerySchema = z.object({ prefix: directoryPrefixSchema });

// Artifact全体のSHA-256を小文字の16進で表したもの。artifacts.sha256の保存形式と同じ。
export const artifactDigestQuerySchema = z.object({
  sha256: z.string().regex(/^[0-9a-f]{64}$/),
  size: z.coerce.number().int().min(0),
});
