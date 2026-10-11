import { Hono } from 'hono';
import { preprocessingReportInputSchema } from '@mmt/contracts/schemas';
import { jsonBody, principal, uuidParam, type ApiEnvironment } from '../http/request.js';
import type { PreprocessingReportService } from '../services/preprocessingReportService.js';

export function preprocessingReportRoutes(
  reports: PreprocessingReportService,
): Hono<ApiEnvironment> {
  const routes = new Hono<ApiEnvironment>();
  routes.get('/:p/runs/:r/dataset-usage', async (context) =>
    context.json(
      await reports.datasetUsage(
        principal(context),
        uuidParam(context, 'p'),
        uuidParam(context, 'r'),
      ),
    ),
  );
  routes.get('/:p/runs/:r/preprocessing-report', async (context) =>
    context.json({
      report: await reports.get(
        principal(context),
        uuidParam(context, 'p'),
        uuidParam(context, 'r'),
      ),
    }),
  );
  routes.put('/:p/runs/:r/preprocessing-report', async (context) =>
    context.json(
      await reports.save(principal(context), uuidParam(context, 'p'), {
        runId: uuidParam(context, 'r'),
        report: await jsonBody(context, preprocessingReportInputSchema),
      }),
    ),
  );
  return routes;
}
