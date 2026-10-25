import {
  SAVED_VIEW_MAX_COLUMNS,
  SAVED_VIEW_NAME_MAX_LENGTH,
  SAVED_VIEW_STATE_MAX_BYTES,
  type ApiErrorCode,
  type SavedViewState,
} from '@mmt/contracts';
import { z } from 'zod';
import { runSearchSchema } from '../routes/runSearchRoutes.js';
import { chartPanelLayoutSchema } from './chartPanelLayoutValidation.js';
import { DomainError } from './errors.js';
import { groupBySchema } from './metricSeries/metricSeriesValidation.js';
import { compileSearchExpression } from './runSearch/runSearchCompiler.js';

/** このAPIが読み書きする唯一のSavedViewState.version。 */
const SAVED_VIEW_STATE_VERSION = 1;
// 列のキーは、メトリクス・parameter・tag（MLflowでは250文字まで）の名前に短い前置きを付けたもの。
const MAX_COLUMN_KEY_LENGTH = 300;
const MIN_COLUMN_WIDTH = 20;
// どの画面よりも広い。一覧が並べられない値だけを拒む。
const MAX_COLUMN_WIDTH = 4000;

const savedViewVisibilitySchema = z.enum(['private', 'project']);
const savedViewPageSchema = z.enum(['runs']);

const savedViewNameSchema = z.string().trim().min(1).max(SAVED_VIEW_NAME_MAX_LENGTH);

const savedViewColumnsSchema = z
  .array(
    z.strictObject({
      key: z.string().min(1).max(MAX_COLUMN_KEY_LENGTH),
      width: z.number().int().min(MIN_COLUMN_WIDTH).max(MAX_COLUMN_WIDTH).optional(),
    }),
  )
  .max(SAVED_VIEW_MAX_COLUMNS)
  .refine(
    (columns) => new Set(columns.map((column) => column.key)).size === columns.length,
    'column keys must be unique',
  );

// 検索条件はRunSearchRequestと同じ上限を使い、ビューがいつでも検索として開けるようにする。
const savedViewSearchSchema = runSearchSchema.pick({
  experimentIds: true,
  filter: true,
  orderBy: true,
  statuses: true,
  kinds: true,
});

export const savedViewStateSchema = savedViewSearchSchema.extend({
  version: z.literal(SAVED_VIEW_STATE_VERSION),
  columns: savedViewColumnsSchema,
  groupBy: groupBySchema.optional(),
  chartPanels: chartPanelLayoutSchema,
});

export const savedViewCreateSchema = z.strictObject({
  visibility: savedViewVisibilitySchema,
  page: savedViewPageSchema.default('runs'),
  name: savedViewNameSchema,
  // validateSavedViewStateが検査し、大きさ・version・filterのエラーをコードで報告する。
  state: z.unknown(),
});

export const savedViewPatchSchema = z
  .strictObject({
    name: savedViewNameSchema.optional(),
    state: z.unknown().optional(),
    visibility: savedViewVisibilitySchema.optional(),
  })
  .refine(
    (patch) => Object.values(patch).some((value) => value !== undefined),
    'at least one of name, state and visibility is required',
  );

export const savedViewListQuerySchema = z.strictObject({
  page: savedViewPageSchema.default('runs'),
});

export type SavedViewCreateInput = z.infer<typeof savedViewCreateSchema>;
export type SavedViewPatchInput = z.infer<typeof savedViewPatchSchema>;
export type SavedViewListQuery = z.infer<typeof savedViewListQuerySchema>;

function invalidState(message: string, code: ApiErrorCode): never {
  throw new DomainError({ status: 422, code, message });
}

/**
 * 送られたstateを検査し、正規化して（既定値を埋めて）返す。filterと並び順はここでコンパイルし、
 * 検索できないビューを、開くときでなく保存するときに拒む。
 */
export function validateSavedViewState(input: unknown): SavedViewState {
  if (Buffer.byteLength(JSON.stringify(input) ?? '', 'utf8') > SAVED_VIEW_STATE_MAX_BYTES)
    invalidState('the saved view state exceeds the 64 KiB limit', 'saved_view_state_too_large');
  const version = (input as { version?: unknown } | null)?.version;
  if (version !== SAVED_VIEW_STATE_VERSION)
    invalidState(
      'unsupported saved view state version',
      'saved_view_state_unsupported_version',
    );
  const parsed = savedViewStateSchema.safeParse(input);
  if (!parsed.success)
    invalidState(
      `invalid saved view state: ${parsed.error.issues.map((issue) => ['state', ...issue.path].join('.')).join(', ')}`,
      'invalid_request',
    );
  const state = parsed.data;
  try {
    compileSearchExpression('run', { filter: state.filter, orderBy: state.orderBy }, []);
  } catch (error) {
    if (error instanceof DomainError)
      invalidState(`invalid saved view search: ${error.message}`, 'saved_view_filter_invalid');
    throw error;
  }
  return state;
}
