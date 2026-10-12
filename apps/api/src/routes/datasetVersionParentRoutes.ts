import { Hono } from 'hono';
import { datasetVersionParentCreateSchema } from '../domain/datasetVersionParentValidation.js';
import {
  jsonBody,
  principal,
  uuidParam,
  type ApiContext,
  type ApiEnvironment,
} from '../http/request.js';
import { requestMetadata } from '../http/requestMetadata.js';
import type { DatasetVersionParentService } from '../services/datasetVersionParentService.js';

function parentLocation(context: ApiContext) {
  return {
    projectId: uuidParam(context, 'p').toLowerCase(),
    datasetId: uuidParam(context, 'id').toLowerCase(),
    versionId: uuidParam(context, 'v').toLowerCase(),
  };
}

export function datasetVersionParentRoutes(
  parents: DatasetVersionParentService,
): Hono<ApiEnvironment> {
  const routes = new Hono<ApiEnvironment>();
  const path = '/:p/datasets/:id/versions/:v/parents';
  routes.get(path, async (context) =>
    context.json(await parents.get(principal(context), parentLocation(context))),
  );
  routes.post(path, async (context) =>
    context.json(
      await parents.append(
        principal(context),
        {
          location: parentLocation(context),
          input: await jsonBody(context, datasetVersionParentCreateSchema),
        },
        requestMetadata(context),
      ),
    ),
  );
  return routes;
}
