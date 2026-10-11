import { Hono } from 'hono';
import { principal, uuidParam, type ApiEnvironment } from '../http/request.js';
import type { RegistryLookupService } from '../services/registryLookupService.js';

export function registryLookupRoutes(lookups: RegistryLookupService): Hono<ApiEnvironment> {
  const routes = new Hono<ApiEnvironment>();
  routes.get('/:p/model-families', async (context) =>
    context.json({ items: await lookups.modelFamilies(principal(context), uuidParam(context, 'p')) }),
  );
  routes.get('/:p/code-versions/:id', async (context) =>
    context.json(
      await lookups.codeVersionDetail(principal(context), {
        projectId: uuidParam(context, 'p'),
        id: uuidParam(context, 'id'),
      }),
    ),
  );
  routes.get('/:p/automation-rules/:id/metric-keys', async (context) =>
    context.json(
      await lookups.ruleMetricKeys(principal(context), {
        projectId: uuidParam(context, 'p'),
        ruleId: uuidParam(context, 'id'),
      }),
    ),
  );
  return routes;
}
