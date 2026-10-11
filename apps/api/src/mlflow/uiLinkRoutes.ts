import { Hono } from 'hono';
import { uuidParam, type ApiEnvironment } from '../http/request.js';

// The Web route that reads an MLflow UI address; apps/web/src/layout/MlflowUiRedirect.tsx.
const MLFLOW_UI_WEB_PATH = 'mlflow-ui';

/**
 * MLflow clients print "View run" and "View experiment" links in the MLflow UI form,
 * <tracking URI>/#/experiments/<experiment>/runs/<run>. A browser sends only <tracking URI>/
 * here, so this redirects to the Web page that reads the part after #; the browser carries that
 * fragment across the redirect (RFC 9110 section 10.2.2).
 *
 * The Location is relative because the tracking URI that the MLflow connection card shows is on
 * the Web origin. Nothing about the Project is revealed, so no sign-in is required here; the Web
 * page checks sign-in and access as for any other page.
 */
export function mlflowUiLinkRoutes(): Hono<ApiEnvironment> {
  const routes = new Hono<ApiEnvironment>();
  // The SDK's links end the tracking URI with a slash; a tracking URI pasted as is has none.
  for (const trackingUriPath of ['/:p', '/:p/'])
    routes.get(trackingUriPath, (context) => {
      const projectId = uuidParam(context, 'p');
      return context.redirect(
        `/projects/${encodeURIComponent(projectId)}/${MLFLOW_UI_WEB_PATH}`,
        302,
      );
    });
  return routes;
}
