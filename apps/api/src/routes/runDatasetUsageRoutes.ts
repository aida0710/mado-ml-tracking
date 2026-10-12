import { Hono } from 'hono';
import { principal, uuidParam, type ApiEnvironment } from '../http/request.js';
import type { RunDatasetUsageService } from '../services/runDatasetUsageService.js';

export function runDatasetUsageRoutes(usage: RunDatasetUsageService): Hono<ApiEnvironment> {
  const routes = new Hono<ApiEnvironment>();
  routes.get('/:p/runs/:r/dataset-usage', async (context) =>
    context.json(
      await usage.get(principal(context), uuidParam(context, 'p'), uuidParam(context, 'r')),
    ),
  );
  return routes;
}
