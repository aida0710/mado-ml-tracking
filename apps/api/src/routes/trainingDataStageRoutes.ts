import { Hono } from 'hono';
import { trainingDataStageCreateSchema } from '../domain/trainingDataStageValidation.js';
import { jsonBody, principal, uuidParam, type ApiEnvironment } from '../http/request.js';
import { requestMetadata } from '../http/requestMetadata.js';
import type { TrainingDataStageService } from '../services/trainingDataStageService.js';

export function trainingDataStageRoutes(stages: TrainingDataStageService): Hono<ApiEnvironment> {
  const routes = new Hono<ApiEnvironment>();
  const path = '/:p/runs/:r/training-data-stages';
  routes.get(path, async (context) =>
    context.json(
      await stages.list(principal(context), {
        projectId: uuidParam(context, 'p').toLowerCase(),
        runId: uuidParam(context, 'r').toLowerCase(),
      }),
    ),
  );
  routes.post(path, async (context) =>
    context.json(
      await stages.append(
        principal(context),
        {
          projectId: uuidParam(context, 'p').toLowerCase(),
          runId: uuidParam(context, 'r').toLowerCase(),
          input: await jsonBody(context, trainingDataStageCreateSchema),
        },
        requestMetadata(context),
      ),
    ),
  );
  return routes;
}
