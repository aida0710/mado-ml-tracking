import { Hono } from 'hono';
import { storageConnectionReassignmentSchema } from '../domain/storageConnectionReassignmentValidation.js';
import { jsonBody, principal, uuidParam, type ApiEnvironment } from '../http/request.js';
import { requestMetadata } from '../http/requestMetadata.js';
import type { StorageConnectionReassignmentService } from '../services/storageConnectionReassignmentService.js';

// /api/projectsに置く。Projectの`s3://`のバージョンのストレージ接続を、まとめて数えて付け替える。
export function storageConnectionReassignmentRoutes(
  reassignments: StorageConnectionReassignmentService,
): Hono<ApiEnvironment> {
  const routes = new Hono<ApiEnvironment>();
  routes.get('/:p/data-catalog/storage-connection-usage', async (context) =>
    context.json(await reassignments.usage(principal(context), uuidParam(context, 'p'))),
  );
  routes.post('/:p/data-catalog/storage-connection-reassignments', async (context) =>
    context.json(
      await reassignments.reassign(
        principal(context),
        {
          projectId: uuidParam(context, 'p'),
          input: await jsonBody(context, storageConnectionReassignmentSchema),
        },
        requestMetadata(context),
      ),
    ),
  );
  return routes;
}
