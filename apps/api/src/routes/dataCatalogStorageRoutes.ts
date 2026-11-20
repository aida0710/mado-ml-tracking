import { Hono } from 'hono';
import { principal, uuidParam, type ApiEnvironment } from '../http/request.js';
import type { DataCatalogConnectionService } from '../services/dataCatalogConnectionService.js';

// /api/projectsに置く。Projectを読める人が使う。
export function dataCatalogStorageRoutes(
  dataCatalog: DataCatalogConnectionService,
): Hono<ApiEnvironment> {
  const routes = new Hono<ApiEnvironment>();
  routes.get('/:p/data-catalog', async (context) =>
    context.json(await dataCatalog.reference(principal(context), uuidParam(context, 'p'))),
  );
  return routes;
}
