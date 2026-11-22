import { Hono } from 'hono';
import { versionStorageConnectionUpdateSchema } from '../domain/versionStorageConnectionValidation.js';
import {
  jsonBody,
  principal,
  uuidParam,
  type ApiContext,
  type ApiEnvironment,
} from '../http/request.js';
import { requestMetadata } from '../http/requestMetadata.js';
import type { VersionStorageConnectionService } from '../services/versionStorageConnectionService.js';

function versionLocation(context: ApiContext) {
  return {
    projectId: uuidParam(context, 'p').toLowerCase(),
    parentId: uuidParam(context, 'id').toLowerCase(),
    versionId: uuidParam(context, 'v').toLowerCase(),
  };
}

// /api/projectsに置く。登録済みのバージョンのストレージ接続のIDを、あとから付ける・直す・外す。
export function versionStorageConnectionRoutes(
  storageConnections: VersionStorageConnectionService,
): Hono<ApiEnvironment> {
  const routes = new Hono<ApiEnvironment>();
  routes.put('/:p/datasets/:id/versions/:v/data-catalog-storage-connection', async (context) =>
    context.json(
      await storageConnections.setOnDatasetVersion(
        principal(context),
        {
          location: versionLocation(context),
          input: await jsonBody(context, versionStorageConnectionUpdateSchema),
        },
        requestMetadata(context),
      ),
    ),
  );
  routes.put('/:p/models/:id/versions/:v/data-catalog-storage-connection', async (context) =>
    context.json(
      await storageConnections.setOnModelVersion(
        principal(context),
        {
          location: versionLocation(context),
          input: await jsonBody(context, versionStorageConnectionUpdateSchema),
        },
        requestMetadata(context),
      ),
    ),
  );
  return routes;
}
