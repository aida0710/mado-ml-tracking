import { createHash } from 'node:crypto';
import {
  MEDIA_COMPARE_MAX_RUNS,
  MEDIA_COMPARE_MAX_STEPS,
  REPORT_BLOCKS_MAX_BYTES,
  REPORT_MARKDOWN_MAX_LENGTH,
  REPORT_MAX_BLOCKS,
  REPORT_MESSAGE_MAX_LENGTH,
  REPORT_RUN_SET_MAX_RUN_IDS,
  REPORT_RUN_TABLE_MAX_COLUMNS,
  REPORT_RUN_TABLE_MAX_ROWS,
  REPORT_TITLE_MAX_LENGTH,
  type ReportBlock,
  type ReportEmbedBlock,
  type ReportRunSet,
} from '@mmt/contracts';
import { z } from 'zod';
import { runSearchSchema } from '../routes/runSearchRoutes.js';
import { chartPanelConfigSchema } from './chartPanelLayoutValidation.js';
import { DomainError } from './errors.js';
import { metricKeySchema } from './metricSeries/metricSeriesValidation.js';
import { runMediaKeySchema } from './runMediaValidation.js';
import { uuidSchema } from './validation.js';

// ブロックのIDは画面側が作る（UUID）。この上限は乱用を拒むためだけのもの。
const MAX_BLOCK_ID_LENGTH = 100;
// MLflowのparameterのkeyは、メトリクスのkeyと同じく250文字まで。
const MAX_PARAM_KEY_LENGTH = 250;
// 保存ビューの列のkeyと同じ。メトリクス、parameter、tagの名前に短い前置きを付けたもの。
const MAX_COLUMN_KEY_LENGTH = 300;
// 分析の表と同じ上限（ANALYSIS_MAX_PARAMS）。
const MAX_PARALLEL_COORDINATE_PARAMS = 100;
/** SweepのRunの集合での散布図の軸。trialの集計した目的の値。 */
const OBJECTIVE_FIELD = 'objective';
const PARAM_FIELD_PREFIX = 'params.';
const METRIC_FIELD_PREFIX = 'metrics.';

// 小文字で保存し、DBが返すIDと等しく比べられるようにする。
const idReferenceSchema = uuidSchema.transform((id) => id.toLowerCase());
const blockIdSchema = z.string().min(1).max(MAX_BLOCK_ID_LENGTH);
const embedModeSchema = z.enum(['live', 'snapshot']);
const uniqueStrings = <T extends z.ZodType<string>>(item: T) =>
  z.array(item).refine((values) => new Set(values).size === values.length, 'values must be unique');

/**
 * Runの検索の上限で検証するが、クライアントが書いたまま保存する。クライアントが省いた条件は、
 * 検索の既定値で埋めずに無いまま残す。
 */
const runSearchConditionsSchema = runSearchSchema.omit({ limit: true, cursor: true });
const storedRunSearchSchema = z
  .record(z.string(), z.unknown())
  .superRefine((search, context) => {
    const parsed = runSearchConditionsSchema.safeParse(search);
    if (!parsed.success)
      for (const issue of parsed.error.issues)
        context.addIssue({ code: 'custom', path: issue.path, message: issue.message });
    for (const field of ['parentRunId', 'name'])
      if (search[field] === null)
        context.addIssue({ code: 'custom', path: [field], message: 'omit the condition instead of null' });
  })
  .transform((search) => search as Extract<ReportRunSet, { search: unknown }>['search']);

const runSetSchema = z.union([
  z.strictObject({ runIds: uniqueStrings(idReferenceSchema).min(1).max(REPORT_RUN_SET_MAX_RUN_IDS) }),
  z.strictObject({ search: storedRunSearchSchema }),
  z.strictObject({ sweepId: idReferenceSchema }),
  z.strictObject({ savedViewId: idReferenceSchema }),
]);

const isSweepRunSet = (runSet: ReportRunSet) => 'sweepId' in runSet;

const scatterFieldSchema = z
  .string()
  .max(MAX_COLUMN_KEY_LENGTH)
  .refine(
    (field) =>
      field === OBJECTIVE_FIELD ||
      ((field.startsWith(PARAM_FIELD_PREFIX) || field.startsWith(METRIC_FIELD_PREFIX)) &&
        field.length > field.indexOf('.') + 1),
    'a scatter field is params.<key>, metrics.<key> or objective',
  );

const markdownBlockSchema = z.strictObject({
  type: z.literal('markdown'),
  id: blockIdSchema,
  text: z.string().max(REPORT_MARKDOWN_MAX_LENGTH),
});

const chartBlockSchema = z.strictObject({
  type: z.literal('chart'),
  id: blockIdSchema,
  panel: chartPanelConfigSchema,
  runSet: runSetSchema,
  mode: embedModeSchema,
});

const parallelCoordinatesBlockSchema = z.strictObject({
  type: z.literal('parallel_coordinates'),
  id: blockIdSchema,
  runSet: runSetSchema,
  params: uniqueStrings(z.string().min(1).max(MAX_PARAM_KEY_LENGTH))
    .min(1)
    .max(MAX_PARALLEL_COORDINATE_PARAMS)
    .optional(),
  metric: metricKeySchema,
  mode: embedModeSchema,
});

const parameterImportanceBlockSchema = z
  .strictObject({
    type: z.literal('parameter_importance'),
    id: blockIdSchema,
    runSet: runSetSchema,
    targetMetric: metricKeySchema.optional(),
    mode: embedModeSchema,
  })
  .refine(
    (block) => block.targetMetric !== undefined || isSweepRunSet(block.runSet),
    'targetMetric is required unless the Run set is a sweep',
  );

const scatterBlockSchema = z
  .strictObject({
    type: z.literal('scatter'),
    id: blockIdSchema,
    runSet: runSetSchema,
    x: scatterFieldSchema,
    y: scatterFieldSchema,
    color: scatterFieldSchema.optional(),
    mode: embedModeSchema,
  })
  .refine(
    (block) => isSweepRunSet(block.runSet) || !scatterFields(block).includes(OBJECTIVE_FIELD),
    'objective is available only for a sweep Run set',
  )
  .refine(
    (block) =>
      scatterFields(block).some(
        (field) => field === OBJECTIVE_FIELD || field.startsWith(METRIC_FIELD_PREFIX),
      ),
    'a scatter plot needs a metrics.<key> or objective field',
  );

const runTableBlockSchema = z.strictObject({
  type: z.literal('run_table'),
  id: blockIdSchema,
  runSet: runSetSchema,
  columns: uniqueStrings(z.string().min(1).max(MAX_COLUMN_KEY_LENGTH)).max(
    REPORT_RUN_TABLE_MAX_COLUMNS,
  ),
  limit: z.number().int().min(1).max(REPORT_RUN_TABLE_MAX_ROWS),
  mode: embedModeSchema,
});

const mediaBlockSchema = z.strictObject({
  type: z.literal('media'),
  id: blockIdSchema,
  runIds: uniqueStrings(idReferenceSchema).min(1).max(MEDIA_COMPARE_MAX_RUNS),
  key: runMediaKeySchema,
  steps: z
    .array(z.number().int().min(0).max(Number.MAX_SAFE_INTEGER))
    .min(1)
    .max(MEDIA_COMPARE_MAX_STEPS)
    .refine((steps) => new Set(steps).size === steps.length, 'steps must be unique')
    .optional(),
  mode: embedModeSchema,
});

const mediaTableBlockSchema = z.strictObject({
  type: z.literal('media_table'),
  id: blockIdSchema,
  runId: idReferenceSchema,
  mediaId: idReferenceSchema,
  mode: embedModeSchema,
});

export const reportBlockSchema = z.discriminatedUnion('type', [
  markdownBlockSchema,
  chartBlockSchema,
  parallelCoordinatesBlockSchema,
  parameterImportanceBlockSchema,
  scatterBlockSchema,
  runTableBlockSchema,
  mediaBlockSchema,
  mediaTableBlockSchema,
]);

// 数と大きさはvalidateReportBlocksで確かめ、上限ごとに専用のコードで応答できるようにする。
const blocksSchema = z.array(reportBlockSchema);
const titleSchema = z.string().trim().min(1).max(REPORT_TITLE_MAX_LENGTH);
const messageSchema = z.string().trim().max(REPORT_MESSAGE_MAX_LENGTH).optional();
const revisionSchema = z.number().int().min(1);

export const reportCreateSchema = z.strictObject({
  title: titleSchema,
  blocks: blocksSchema,
  message: messageSchema,
});

export const reportUpdateSchema = z
  .strictObject({
    baseRevision: revisionSchema,
    title: titleSchema,
    blocks: blocksSchema,
    message: messageSchema,
    refreshSnapshotBlockIds: uniqueStrings(blockIdSchema).max(REPORT_MAX_BLOCKS).default([]),
  })
  .refine(
    (update) =>
      update.refreshSnapshotBlockIds.every((id) =>
        update.blocks.some((block) => block.id === id && isSnapshotBlock(block)),
      ),
    'refreshSnapshotBlockIds must name snapshot blocks of this revision',
  );

export const reportRestoreSchema = z.strictObject({ revision: revisionSchema });

// レポートの1ページは一覧の画面。200はコメントの上限とも同じ。
const DEFAULT_REPORT_PAGE_SIZE = 50;
const MAX_REPORT_PAGE_SIZE = 200;

export const reportListQuerySchema = z.strictObject({
  cursor: uuidSchema.optional(),
  limit: z.coerce.number().int().min(1).max(MAX_REPORT_PAGE_SIZE).default(DEFAULT_REPORT_PAGE_SIZE),
  includeArchived: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
});

export const reportRevisionQuerySchema = z.strictObject({
  revision: z.coerce.number().int().min(1).optional(),
});

export type ReportCreateInput = z.infer<typeof reportCreateSchema>;
export type ReportUpdateInput = z.infer<typeof reportUpdateSchema>;
export type ReportListQuery = z.infer<typeof reportListQuerySchema>;

function scatterFields(block: { x: string; y: string; color?: string }): string[] {
  return [block.x, block.y, ...(block.color === undefined ? [] : [block.color])];
}

/** 散布図の項目を、分析の表が返すべきparameterとメトリクスに分ける。 */
export function scatterTableKeys(block: { x: string; y: string; color?: string }): {
  params: string[];
  metrics: string[];
} {
  const fields = [...new Set(scatterFields(block))];
  const keysWith = (prefix: string) =>
    fields.filter((field) => field.startsWith(prefix)).map((field) => field.slice(prefix.length));
  return { params: keysWith(PARAM_FIELD_PREFIX), metrics: keysWith(METRIC_FIELD_PREFIX) };
}

export function isSnapshotBlock(block: ReportBlock): block is ReportEmbedBlock {
  return block.type !== 'markdown' && block.mode === 'snapshot';
}

/** 一覧全体にかかる上限。zodではそれぞれ専用のコードで返せない。 */
export function validateReportBlocks(blocks: readonly ReportBlock[]): void {
  if (blocks.length > REPORT_MAX_BLOCKS)
    throw new DomainError({
      status: 422,
      code: 'report_too_many_blocks',
      message: `a report can have at most ${REPORT_MAX_BLOCKS} blocks`,
      details: { limit: REPORT_MAX_BLOCKS },
    });
  if (Buffer.byteLength(JSON.stringify(blocks)) > REPORT_BLOCKS_MAX_BYTES)
    throw new DomainError({
      status: 422,
      code: 'report_blocks_too_large',
      message: 'the report content exceeds 1 MiB',
    });
  const ids = blocks.map((block) => block.id);
  if (new Set(ids).size !== ids.length)
    throw new DomainError({
      status: 422,
      code: 'report_block_id_duplicate',
      message: 'block ids must be unique',
    });
}

/** バージョンが参照するID。すべてレポートのProjectに属している必要がある。 */
export interface ReportReferences {
  runIds: string[];
  sweepIds: string[];
  savedViewIds: string[];
  experimentIds: string[];
  modelVersionIds: string[];
  datasetVersionIds: string[];
  media: { runId: string; mediaId: string }[];
}

export function collectReportReferences(blocks: readonly ReportBlock[]): ReportReferences {
  const references: ReportReferences = {
    runIds: [],
    sweepIds: [],
    savedViewIds: [],
    experimentIds: [],
    modelVersionIds: [],
    datasetVersionIds: [],
    media: [],
  };
  const addRunSet = (runSet: ReportRunSet) => {
    if ('runIds' in runSet) references.runIds.push(...runSet.runIds);
    else if ('sweepId' in runSet) references.sweepIds.push(runSet.sweepId);
    else if ('savedViewId' in runSet) references.savedViewIds.push(runSet.savedViewId);
    else {
      const { search } = runSet;
      references.experimentIds.push(...(search.experimentIds ?? []));
      references.modelVersionIds.push(...(search.modelVersionIds ?? []));
      references.datasetVersionIds.push(...(search.inputDatasetVersionIds ?? []));
      if (search.parentRunId) references.runIds.push(search.parentRunId);
    }
  };
  for (const block of blocks) {
    if (block.type === 'markdown') continue;
    if (block.type === 'media') references.runIds.push(...block.runIds);
    else if (block.type === 'media_table') {
      references.runIds.push(block.runId);
      references.media.push({ runId: block.runId, mediaId: block.mediaId });
    } else addRunSet(block.runSet);
  }
  const unique = (values: string[]) => [...new Set(values.map((value) => value.toLowerCase()))];
  return {
    runIds: unique(references.runIds),
    sweepIds: unique(references.sweepIds),
    savedViewIds: unique(references.savedViewIds),
    experimentIds: unique(references.experimentIds),
    modelVersionIds: unique(references.modelVersionIds),
    datasetVersionIds: unique(references.datasetVersionIds),
    media: references.media,
  };
}

// jsonbはオブジェクトのキーの順を変えるので、DBから読み戻したブロックと比べられるよう、
// digestではキーを並べ替える。
function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object')
    return `{${Object.entries(value)
      .filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`)
      .join(',')}}`;
  return JSON.stringify(value);
}

/** 中身が同じブロックなら等しくなり、変わっていないスナップショットのブロックがデータを保てる。 */
export function reportBlockDigest(block: ReportBlock): string {
  return createHash('sha256').update(canonicalJson(block)).digest('hex');
}
