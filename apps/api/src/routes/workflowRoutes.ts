import { Hono } from 'hono';
import {
  workflowCreateSchema,
  workflowVersionCreateSchema,
  workflowLaunchSchema,
} from '@mmt/contracts/schemas';
import { workflowHistoryQuerySchema } from '../domain/workflowValidation.js';
import { jsonBody, parse, principal, uuidParam, type ApiEnvironment } from '../http/request.js';
import type { WorkflowDefinitionService } from '../services/workflowDefinitionService.js';
import type { WorkflowExecutionService } from '../services/workflowExecutionService.js';

export function workflowRoutes(services: {
  definitions: WorkflowDefinitionService;
  executions: WorkflowExecutionService;
}): Hono<ApiEnvironment> {
  const routes = new Hono<ApiEnvironment>();
  routes.get('/:p/workflows', async (context) =>
    context.json({
      items: await services.definitions.list(principal(context), uuidParam(context, 'p')),
    }),
  );
  routes.post('/:p/workflows', async (context) =>
    context.json(
      await services.definitions.create(
        principal(context),
        uuidParam(context, 'p'),
        await jsonBody(context, workflowCreateSchema),
      ),
      201,
    ),
  );
  routes.get('/:p/workflows/:id', async (context) =>
    context.json(
      await services.definitions.get(
        principal(context),
        uuidParam(context, 'p'),
        uuidParam(context, 'id'),
      ),
    ),
  );
  routes.post('/:p/workflows/:id/versions', async (context) =>
    context.json(
      await services.definitions.createVersion(principal(context), uuidParam(context, 'p'), {
        workflowId: uuidParam(context, 'id'),
        input: await jsonBody(context, workflowVersionCreateSchema),
      }),
      201,
    ),
  );
  routes.post('/:p/workflows/:id/launch', async (context) =>
    context.json(
      await services.executions.launch(principal(context), uuidParam(context, 'p'), {
        workflowId: uuidParam(context, 'id'),
        input: await jsonBody(context, workflowLaunchSchema),
      }),
      201,
    ),
  );
  routes.get('/:p/workflows/:id/executions', async (context) =>
    context.json(
      await services.executions.history(principal(context), uuidParam(context, 'p'), {
        workflowId: uuidParam(context, 'id'),
        ...parse(workflowHistoryQuerySchema, context.req.query()),
      }),
    ),
  );
  routes.get('/:p/workflow-executions/:id', async (context) =>
    context.json(
      await services.executions.get(
        principal(context),
        uuidParam(context, 'p'),
        uuidParam(context, 'id'),
      ),
    ),
  );
  routes.post('/:p/workflow-executions/:id/cancel', async (context) =>
    context.json(
      await services.executions.cancel(
        principal(context),
        uuidParam(context, 'p'),
        uuidParam(context, 'id'),
      ),
    ),
  );
  return routes;
}
