import { Hono } from 'hono';
import {
  directoryListingRequestSchema,
  targetCheckClaimSchema,
  targetCheckCompleteSchema,
  targetCheckRequestSchema,
} from '../domain/targetCheckValidation.js';
import {
  jsonBody,
  optionalJsonBody,
  principal,
  uuidParam,
  type ApiEnvironment,
} from '../http/request.js';
import { requestMetadata } from '../http/requestMetadata.js';
import type { TargetCheckService } from '../services/targetCheckService.js';
import type { TargetDirectoryListingService } from '../services/targetDirectoryListingService.js';

// Mounted at /api: administrators ask workers to check computers and read their directories;
// workers claim and report both.
export function targetCheckRoutes(
  checks: TargetCheckService,
  listings: TargetDirectoryListingService,
): Hono<ApiEnvironment> {
  const routes = new Hono<ApiEnvironment>();
  routes.get('/targets/check-workers', async (context) =>
    context.json({ items: await checks.checkWorkers(principal(context)) }),
  );
  routes.post('/targets/:id/checks', async (context) =>
    context.json(
      await checks.request(
        principal(context),
        uuidParam(context, 'id'),
        // Clients from before chosen workers send no body.
        await optionalJsonBody(context, targetCheckRequestSchema),
        requestMetadata(context),
      ),
      201,
    ),
  );
  routes.get('/targets/:id/checks', async (context) =>
    context.json({ items: await checks.list(principal(context), uuidParam(context, 'id')) }),
  );
  routes.post('/targets/:id/directory-listings', async (context) => {
    const { listing, created } = await listings.request(
      principal(context),
      uuidParam(context, 'id'),
      await jsonBody(context, directoryListingRequestSchema),
      requestMetadata(context),
    );
    return context.json(listing, created ? 201 : 200);
  });
  routes.get('/targets/:id/directory-listings/:listingId', async (context) =>
    context.json(
      await listings.get(principal(context), {
        targetId: uuidParam(context, 'id'),
        listingId: uuidParam(context, 'listingId'),
      }),
    ),
  );
  routes.post('/worker/target-checks/claim', async (context) =>
    context.json({
      item: await checks.claim(principal(context), await jsonBody(context, targetCheckClaimSchema)),
    }),
  );
  routes.post('/worker/target-checks/:id/complete', async (context) =>
    context.json(
      await checks.complete(
        principal(context),
        uuidParam(context, 'id'),
        await jsonBody(context, targetCheckCompleteSchema),
      ),
    ),
  );
  return routes;
}
