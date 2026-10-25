import { Hono } from 'hono';
import { z } from 'zod';
import type { RunSearchService } from '../services/runSearchService.js';
import { runKindSchema, runStatusSchema, uuidSchema } from '../domain/validation.js';
import { jsonBody, principal, uuidParam, type ApiEnvironment } from '../http/request.js';

// docs/api-contract.mdで公開している上限。要約500件なら、pollで許容する量を十分下回る。
const DEFAULT_PAGE_SIZE = 100;
const MAX_PAGE_SIZE = 500;
const MAX_FILTER_LENGTH = 2000;
const MAX_ORDER_BY = 5;
const MAX_ORDER_BY_LENGTH = 500;
// クエリに渡す配列にはそれぞれ上限を設ける。画面が送るIDは数個で、SDKの呼び出し側は代わりに
// ページ送りできる。
const MAX_ID_CONDITIONS = 100;
// 既存のGET /runsの名前のクエリと同じ。
const MAX_NAME_LENGTH = 200;
// cursorが持つのはUUIDか、オフセットとSHA-256のフィンガープリントで、これよりずっと短い。
const MAX_CURSOR_LENGTH = 1000;

const uuidListSchema = z.array(uuidSchema).max(MAX_ID_CONDITIONS).default([]);
export const runSearchSchema = z.strictObject({
  experimentIds: uuidListSchema,
  filter: z.string().max(MAX_FILTER_LENGTH).default(''),
  orderBy: z.array(z.string().max(MAX_ORDER_BY_LENGTH)).max(MAX_ORDER_BY).default([]),
  kinds: z.array(runKindSchema).max(MAX_ID_CONDITIONS).default([]),
  statuses: z.array(runStatusSchema).max(MAX_ID_CONDITIONS).default([]),
  modelVersionIds: uuidListSchema,
  inputDatasetVersionIds: uuidListSchema,
  parentRunId: uuidSchema.nullable().default(null),
  name: z
    .string()
    .max(MAX_NAME_LENGTH)
    .transform((name) => name.trim() || null)
    .nullable()
    .default(null),
  limit: z.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
  cursor: z.string().min(1).max(MAX_CURSOR_LENGTH).nullable().default(null),
});

export function runSearchRoutes(runSearch: RunSearchService): Hono<ApiEnvironment> {
  const routes = new Hono<ApiEnvironment>();
  routes.post('/:p/runs/search', async (context) =>
    context.json(
      await runSearch.search(
        principal(context),
        uuidParam(context, 'p'),
        await jsonBody(context, runSearchSchema),
      ),
    ),
  );
  return routes;
}
