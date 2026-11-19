import { Hono } from 'hono';
import type { PluginService } from '../services/pluginService.js';
import { pluginCreateSchema, pluginPatchSchema } from '../domain/validation.js';
import { jsonBody, principal, uuidParam, type ApiEnvironment } from '../http/request.js';

export function pluginRoutes(plugins: PluginService): Hono<ApiEnvironment> {
  const routes = new Hono<ApiEnvironment>();
  routes.get('/:p/plugins', async (context) =>
    context.json({ items: await plugins.list(principal(context), uuidParam(context, 'p')) }),
  );
  routes.post('/:p/plugins', async (context) =>
    context.json(
      await plugins.create(
        principal(context),
        uuidParam(context, 'p'),
        await jsonBody(context, pluginCreateSchema),
      ),
      201,
    ),
  );
  routes.patch('/:p/plugins/:id', async (context) =>
    context.json(
      await plugins.patch(principal(context), uuidParam(context, 'p'), {
        pluginId: uuidParam(context, 'id'),
        input: await jsonBody(context, pluginPatchSchema),
      }),
    ),
  );
  routes.post('/:p/plugins/:id/check', async (context) =>
    context.json(
      await plugins.check(principal(context), uuidParam(context, 'p'), uuidParam(context, 'id')),
    ),
  );
  routes.get('/:p/plugins/:id/metrics', async (context) =>
    context.json(
      await plugins.metrics(principal(context), uuidParam(context, 'p'), uuidParam(context, 'id')),
    ),
  );
  return routes;
}
