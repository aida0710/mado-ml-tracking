import { Hono } from 'hono';
import { modelTrainingSourceCreateSchema } from '../domain/modelTrainingSourceValidation.js';
import {
  jsonBody,
  principal,
  uuidParam,
  type ApiContext,
  type ApiEnvironment,
} from '../http/request.js';
import { requestMetadata } from '../http/requestMetadata.js';
import type { ModelTrainingSourceService } from '../services/modelTrainingSourceService.js';

function trainingSourceLocation(context: ApiContext) {
  return {
    projectId: uuidParam(context, 'p').toLowerCase(),
    modelId: uuidParam(context, 'id').toLowerCase(),
    versionId: uuidParam(context, 'v').toLowerCase(),
  };
}

export function modelTrainingSourceRoutes(
  trainingSources: ModelTrainingSourceService,
): Hono<ApiEnvironment> {
  const routes = new Hono<ApiEnvironment>();
  const path = '/:p/models/:id/versions/:v/training-source';
  routes.get(path, async (context) =>
    context.json({
      source: await trainingSources.get(principal(context), trainingSourceLocation(context)),
    }),
  );
  routes.post(path, async (context) =>
    context.json(
      await trainingSources.associate(
        principal(context),
        {
          location: trainingSourceLocation(context),
          input: await jsonBody(context, modelTrainingSourceCreateSchema),
        },
        requestMetadata(context),
      ),
    ),
  );
  return routes;
}
