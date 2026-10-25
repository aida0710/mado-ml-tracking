import { Hono } from 'hono';
import { isValidStorageBackendName } from '@mmt/platform';
import {
  storageBackendCreateSchema,
  storageBackendPatchSchema,
  storageDirectoryQuerySchema,
  storageSettingsSchema,
} from '../domain/storageBackendValidation.js';
import { DomainError } from '../domain/errors.js';
import {
  jsonBody,
  parse,
  principal,
  type ApiContext,
  type ApiEnvironment,
} from '../http/request.js';
import { requestMetadata } from '../http/requestMetadata.js';
import type { StorageBackendService } from '../services/storageBackendService.js';
import type { StorageDirectoryService } from '../services/storageDirectoryService.js';

function backendName(context: ApiContext): string {
  const name = context.req.param('name');
  // 保存する名前の規則に合わないものは、既存の保存先の名前になりえない。
  if (!name || !isValidStorageBackendName(name))
    throw new DomainError({ status: 404, code: 'not_found', message: 'storage backend not found' });
  return name;
}

// /api/adminに置く。どの操作も全体管理者に限る。
export function storageBackendRoutes(
  storage: StorageBackendService,
  directories: StorageDirectoryService,
): Hono<ApiEnvironment> {
  const routes = new Hono<ApiEnvironment>();
  routes.get('/storage-backends', async (context) =>
    context.json({ items: await storage.list(principal(context)) }),
  );
  routes.post('/storage-backends', async (context) =>
    context.json(
      await storage.create(
        principal(context),
        await jsonBody(context, storageBackendCreateSchema),
        requestMetadata(context),
      ),
      201,
    ),
  );
  routes.patch('/storage-backends/:name', async (context) =>
    context.json(
      await storage.update(
        principal(context),
        backendName(context),
        await jsonBody(context, storageBackendPatchSchema),
        requestMetadata(context),
      ),
    ),
  );
  routes.post('/storage-backends/:name/test', async (context) =>
    context.json(
      await storage.test(principal(context), backendName(context), requestMetadata(context)),
    ),
  );
  routes.get('/storage-settings', async (context) =>
    context.json(await storage.getSettings(principal(context))),
  );
  routes.put('/storage-settings', async (context) =>
    context.json(
      await storage.updateSettings(
        principal(context),
        await jsonBody(context, storageSettingsSchema),
        requestMetadata(context),
      ),
    ),
  );
  routes.get('/storage-directories', async (context) =>
    context.json(
      await directories.suggest(
        principal(context),
        parse(storageDirectoryQuerySchema, context.req.query()).path,
      ),
    ),
  );
  return routes;
}
