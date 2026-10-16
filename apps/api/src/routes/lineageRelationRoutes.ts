import { Hono } from 'hono';
import { lineageRelationCreateSchema } from '../domain/lineageRelationValidation.js';
import { jsonBody, principal, uuidParam, type ApiEnvironment } from '../http/request.js';
import { requestMetadata } from '../http/requestMetadata.js';
import type { LineageRelationService } from '../services/lineageRelationService.js';

export function lineageRelationRoutes(service: LineageRelationService): Hono<ApiEnvironment> {
  const routes = new Hono<ApiEnvironment>();
  routes.get('/:p/lineage/relations', async (context) =>
    context.json(await service.list(principal(context), uuidParam(context, 'p'))));
  routes.post('/:p/lineage/relations', async (context) =>
    context.json(await service.append(principal(context), {
      projectId: uuidParam(context, 'p'),
      input: await jsonBody(context, lineageRelationCreateSchema),
      request: requestMetadata(context),
    })));
  return routes;
}
