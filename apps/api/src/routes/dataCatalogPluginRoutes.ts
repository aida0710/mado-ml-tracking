import { Hono } from 'hono';
import { dataCatalogConnectionInputSchema } from '../domain/dataCatalogConnectionValidation.js';
import { jsonBody, principal, type ApiEnvironment } from '../http/request.js';
import { requestMetadata } from '../http/requestMetadata.js';
import type { DataCatalogConnectionService } from '../services/dataCatalogConnectionService.js';

// /api/adminに置く。どの操作も全体管理者に限る。
export function dataCatalogPluginRoutes(
  dataCatalog: DataCatalogConnectionService,
): Hono<ApiEnvironment> {
  const routes = new Hono<ApiEnvironment>();
  routes.get('/plugins/data-catalog', async (context) =>
    context.json(await dataCatalog.get(principal(context))),
  );
  routes.put('/plugins/data-catalog', async (context) =>
    context.json(
      await dataCatalog.connect(
        principal(context),
        await jsonBody(context, dataCatalogConnectionInputSchema),
        requestMetadata(context),
      ),
    ),
  );
  routes.delete('/plugins/data-catalog', async (context) => {
    await dataCatalog.disconnect(principal(context), requestMetadata(context));
    return context.body(null, 204);
  });
  routes.get('/plugins/data-catalog/capacity', async (context) =>
    context.json(await dataCatalog.capacity(principal(context))),
  );
  return routes;
}
