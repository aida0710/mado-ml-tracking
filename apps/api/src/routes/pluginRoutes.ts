import { Hono } from 'hono';
import { z } from 'zod';
import type { PluginService } from '../services/pluginService.js';
import { pluginCreateSchema, pluginPatchSchema } from '../domain/validation.js';
import { jsonBody, principal, uuidParam, type ApiEnvironment } from '../http/request.js';

// Keep validation aligned with Mado's service catalog rather than failing downstream.
const MAX_MADO_QUERY_LENGTH = 512;
export const pluginDatasetSearchSchema = z.strictObject({
  query: z.string().trim().max(MAX_MADO_QUERY_LENGTH),
  expectedRevision: z.number().int().nonnegative().optional(),
});
export const pluginDatasetImportSchema = z.strictObject({
  externalId: z.uuid(),
  expectedRevision: z.number().int().nonnegative(),
});

export const pluginMigrationCompleteSchema = z.strictObject({
  expectedRevision: z.number().int().nonnegative(),
});
export const pluginDeliveryReceiptsSchema = z.strictObject({
  receipts: z
    .array(z.strictObject({ eventId: z.uuid(), payloadHash: z.string().regex(/^[a-f0-9]{64}$/) }))
    .min(1)
    .max(1000),
});

export function pluginRoutes(plugins: PluginService): Hono<ApiEnvironment> {
  const routes = new Hono<ApiEnvironment>();
  routes.get('/:p/plugins/availability', async (context) =>
    context.json({
      items: await plugins.availability(principal(context), uuidParam(context, 'p')),
    }),
  );
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
  routes.post('/:p/plugins/:id/datasets/search', async (context) => {
    const input = await jsonBody(context, pluginDatasetSearchSchema);
    return context.json(
      await plugins.search(principal(context), uuidParam(context, 'p'), {
        pluginId: uuidParam(context, 'id'),
        query: input.query,
        expectedRevision: input.expectedRevision,
      }),
    );
  });
  routes.post('/:p/plugins/:id/datasets/import', async (context) => {
    const input = await jsonBody(context, pluginDatasetImportSchema);
    return context.json(
      await plugins.importDataset(principal(context), uuidParam(context, 'p'), {
        pluginId: uuidParam(context, 'id'),
        externalId: input.externalId,
        expectedRevision: input.expectedRevision,
      }),
      201,
    );
  });
  routes.get('/:p/plugins/:id/outbox', async (context) =>
    context.json(
      await plugins.outboxSummary(
        principal(context),
        uuidParam(context, 'p'),
        uuidParam(context, 'id'),
      ),
    ),
  );
  routes.post('/:p/plugins/:id/events/retry', async (context) =>
    context.json(
      await plugins.retryEvents(
        principal(context),
        uuidParam(context, 'p'),
        uuidParam(context, 'id'),
      ),
    ),
  );
  routes.post('/:p/plugins/:id/migration/complete', async (context) => {
    const input = await jsonBody(context, pluginMigrationCompleteSchema);
    return context.json(
      await plugins.completeMigration(principal(context), uuidParam(context, 'p'), {
        pluginId: uuidParam(context, 'id'),
        ...input,
      }),
    );
  });
  routes.post('/:p/plugins/:id/events/receipts', async (context) => {
    const input = await jsonBody(context, pluginDeliveryReceiptsSchema);
    return context.json(
      await plugins.importReceipts(principal(context), uuidParam(context, 'p'), {
        pluginId: uuidParam(context, 'id'),
        ...input,
      }),
    );
  });
  return routes;
}
