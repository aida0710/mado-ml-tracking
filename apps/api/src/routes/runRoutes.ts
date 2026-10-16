import { Hono } from 'hono';
import { z } from 'zod';
import {
  MAX_RUN_LOG_TAIL,
  RUN_COMPARISON_MAX_METRIC_KEYS,
  RUN_COMPARISON_MAX_RUNS,
  RUN_COMPARISON_MIN_RUNS,
  RUN_EXPORT_TRUNCATED_HEADER,
} from '@mmt/contracts';
import type { RunService } from '../services/runService.js';
import type { LineageService } from '../services/lineageService.js';
import type { RunComparisonService } from '../services/runComparisonService.js';
import type { RunExportService } from '../services/runExportService.js';
import { CSV_CONTENT_TYPE } from '../domain/csvEncoding.js';
import { LOG_FILE_CONTENT_TYPE } from '../domain/runLogFile.js';
import { attachmentDisposition } from '../http/attachmentDisposition.js';
import { textStream } from '../http/textStream.js';
import {
  logBatchSchema,
  metricBatchSchema,
  runCreateSchema,
  runPatchSchema,
  uuidSchema,
} from '../domain/validation.js';
import { jsonBody, parse, principal, uuidParam, type ApiEnvironment } from '../http/request.js';
import { runSearchSchema } from './runSearchRoutes.js';

// Without tail every line comes back (a download); a screen polls the latest lines only.
export const runLogQuerySchema = z.strictObject({
  tail: z.coerce.number().int().min(1).max(MAX_RUN_LOG_TAIL).optional(),
});

// MLflow accepts metric keys up to 250 characters, longer than native metric names.
const MAX_METRIC_KEY_LENGTH = 250;

const comparedRunIdsSchema = z
  .array(uuidSchema)
  .min(RUN_COMPARISON_MIN_RUNS)
  .max(RUN_COMPARISON_MAX_RUNS)
  .refine((ids) => new Set(ids).size === ids.length, 'runIds must be unique');
const comparisonBaseSchema = {
  runIds: comparedRunIdsSchema,
  baselineRunId: uuidSchema.nullable().default(null),
};
const baselineInRunIds = (comparison: { runIds: string[]; baselineRunId: string | null }) =>
  comparison.baselineRunId === null || comparison.runIds.includes(comparison.baselineRunId);
const BASELINE_NOT_COMPARED = {
  message: 'baselineRunId must be one of runIds',
  path: ['baselineRunId'],
};

export const runComparisonSchema = z
  .strictObject({
    ...comparisonBaseSchema,
    metricKeys: z
      .array(z.string().min(1).max(MAX_METRIC_KEY_LENGTH))
      .max(RUN_COMPARISON_MAX_METRIC_KEYS)
      .refine((keys) => new Set(keys).size === keys.length, 'metricKeys must be unique')
      .nullable()
      .default(null),
    includeHistory: z.boolean().default(false),
  })
  .refine(baselineInRunIds, BASELINE_NOT_COMPARED);
// A GET link carries the Run IDs comma-separated, as the Compare page URL does.
export const runComparisonCsvQuerySchema = z
  .strictObject({
    ...comparisonBaseSchema,
    runIds: z
      .string()
      .transform((ids) => ids.split(',').filter(Boolean))
      .pipe(comparedRunIdsSchema),
  })
  .refine(baselineInRunIds, BASELINE_NOT_COMPARED);

export function runRoutes(services: {
  runs: RunService;
  lineage: LineageService;
  runComparison: RunComparisonService;
  runExport: RunExportService;
}): Hono<ApiEnvironment> {
  const { runs, lineage, runComparison, runExport } = services;
  const routes = new Hono<ApiEnvironment>();
  // Registered before /:p/runs/:r, which would otherwise take compare.csv as a Run ID.
  routes.post('/:p/runs/compare', async (context) =>
    context.json(
      await runComparison.compare(
        principal(context),
        uuidParam(context, 'p'),
        await jsonBody(context, runComparisonSchema),
      ),
    ),
  );
  routes.get('/:p/runs/compare.csv', async (context) => {
    const query = parse(runComparisonCsvQuerySchema, context.req.query());
    const exported = await runExport.exportComparison(principal(context), uuidParam(context, 'p'), {
      ...query,
      metricKeys: null,
    });
    return context.body(exported.csv, 200, {
      'Content-Type': CSV_CONTENT_TYPE,
      'Content-Disposition': attachmentDisposition(exported.fileName),
    });
  });
  routes.post('/:p/runs/search/export.csv', async (context) => {
    // The body of POST /runs/search is accepted as is; paging fields do not apply to an export.
    const {
      limit: _limit,
      cursor: _cursor,
      ...conditions
    } = await jsonBody(context, runSearchSchema);
    const exported = await runExport.exportSearch(
      principal(context),
      uuidParam(context, 'p'),
      conditions,
    );
    return context.body(textStream(exported.chunks), 200, {
      'Content-Type': CSV_CONTENT_TYPE,
      'Content-Disposition': attachmentDisposition(exported.fileName),
      [RUN_EXPORT_TRUNCATED_HEADER]: String(exported.truncated),
    });
  });
  routes.post('/:p/runs', async (context) =>
    context.json(
      await runs.create(
        principal(context),
        uuidParam(context, 'p'),
        await jsonBody(context, runCreateSchema),
      ),
      201,
    ),
  );
  routes.get('/:p/runs/:r', async (context) =>
    context.json(
      await runs.get(principal(context), uuidParam(context, 'p'), uuidParam(context, 'r')),
    ),
  );
  routes.patch('/:p/runs/:r', async (context) =>
    context.json(
      await runs.patch(principal(context), uuidParam(context, 'p'), {
        runId: uuidParam(context, 'r'),
        input: await jsonBody(context, runPatchSchema),
      }),
    ),
  );
  routes.get('/:p/runs/:r/metrics', async (context) =>
    context.json({
      items: await runs.metrics(
        principal(context),
        uuidParam(context, 'p'),
        uuidParam(context, 'r'),
      ),
    }),
  );
  routes.post('/:p/runs/:r/metrics', async (context) => {
    const input = await jsonBody(context, metricBatchSchema);
    await runs.addMetrics(principal(context), uuidParam(context, 'p'), {
      runId: uuidParam(context, 'r'),
      metrics: input.metrics,
    });
    return context.body(null, 204);
  });
  routes.get('/:p/runs/:r/logs', async (context) => {
    const { tail } = parse(runLogQuerySchema, context.req.query());
    return context.json(
      await runs.logs(principal(context), uuidParam(context, 'p'), {
        runId: uuidParam(context, 'r'),
        tail,
      }),
    );
  });
  routes.get('/:p/runs/:r/logs/download', async (context) => {
    const file = await runs.logFile(
      principal(context),
      uuidParam(context, 'p'),
      uuidParam(context, 'r'),
    );
    return context.body(textStream(file.chunks), 200, {
      'Content-Type': LOG_FILE_CONTENT_TYPE,
      'Content-Disposition': attachmentDisposition(file.fileName),
    });
  });
  routes.post('/:p/runs/:r/logs', async (context) => {
    const input = await jsonBody(context, logBatchSchema);
    await runs.addLogs(principal(context), uuidParam(context, 'p'), {
      runId: uuidParam(context, 'r'),
      entries: input.entries,
    });
    return context.body(null, 204);
  });
  routes.get('/:p/lineage', async (context) =>
    context.json(await lineage.graph(principal(context), uuidParam(context, 'p'))),
  );
  return routes;
}
