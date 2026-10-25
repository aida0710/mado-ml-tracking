import { Hono } from 'hono';
import {
  siteCancellationQuerySchema,
  siteCancellationReportSchema,
  siteSubmissionClaimSchema,
  siteSubmissionReportSchema,
} from '../domain/siteExecutionValidation.js';
import {
  launcherConnectionCheckResultSchema,
  launcherCreateSchema,
  launcherKeyPublishSchema,
} from '../domain/siteSettingsValidation.js';
import { jsonBody, principal, uuidParam, type ApiEnvironment } from '../http/request.js';
import { requestMetadata } from '../http/requestMetadata.js';
import type { LauncherService } from '../services/launcherService.js';
import type { SiteSubmissionService } from '../services/siteSubmissionService.js';

// /api/launchersに置く。全体管理者がlauncherを登録し、そのtokenを発行する。
export function launcherAdminRoutes(launchers: LauncherService): Hono<ApiEnvironment> {
  const routes = new Hono<ApiEnvironment>();
  routes.get('/', async (context) =>
    context.json({ items: await launchers.list(principal(context)) }),
  );
  routes.post('/', async (context) =>
    context.json(
      await launchers.create(principal(context), {
        name: (await jsonBody(context, launcherCreateSchema)).name,
        metadata: requestMetadata(context),
      }),
      201,
    ),
  );
  routes.post('/:id/token', async (context) =>
    context.json(
      await launchers.replaceToken(
        principal(context),
        uuidParam(context, 'id'),
        requestMetadata(context),
      ),
      201,
    ),
  );
  routes.delete('/:id', async (context) => {
    await launchers.revoke(principal(context), uuidParam(context, 'id'), requestMetadata(context));
    return context.body(null, 204);
  });
  return routes;
}

// /api/launcherに置く。launcher自身が自分のtokenで呼ぶ。
export function launcherRuntimeRoutes(services: {
  launchers: LauncherService;
  submissions: SiteSubmissionService;
}): Hono<ApiEnvironment> {
  const { launchers, submissions } = services;
  const routes = new Hono<ApiEnvironment>();
  routes.get('/config', async (context) =>
    context.json(await launchers.configuration(principal(context))),
  );
  routes.post('/site-submissions/claim', async (context) =>
    context.json({
      items: await submissions.claim(
        principal(context),
        await jsonBody(context, siteSubmissionClaimSchema),
      ),
    }),
  );
  routes.post('/site-submissions/report', async (context) =>
    context.json({
      items: await submissions.report(
        principal(context),
        await jsonBody(context, siteSubmissionReportSchema),
      ),
    }),
  );
  routes.post('/site-submissions/cancellations', async (context) =>
    context.json({
      items: await submissions.cancellations(
        principal(context),
        await jsonBody(context, siteCancellationQuerySchema),
      ),
    }),
  );
  routes.post('/site-submissions/cancellations/report', async (context) => {
    await submissions.reportCancellations(
      principal(context),
      await jsonBody(context, siteCancellationReportSchema),
    );
    return context.body(null, 204);
  });
  routes.put('/keys/:keyId', async (context) =>
    context.json(
      await launchers.publishKey(
        principal(context),
        uuidParam(context, 'keyId'),
        await jsonBody(context, launcherKeyPublishSchema),
      ),
    ),
  );
  routes.post('/connection-checks/:checkId', async (context) => {
    await launchers.reportConnectionCheck(
      principal(context),
      uuidParam(context, 'checkId'),
      await jsonBody(context, launcherConnectionCheckResultSchema),
    );
    return context.body(null, 204);
  });
  return routes;
}
