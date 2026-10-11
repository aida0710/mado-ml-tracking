/**
 * The route under /projects/:projectId that reads an MLflow UI address. The API redirects the
 * tracking URI here (apps/api/src/mlflow/uiLinkRoutes.ts), and the browser keeps the link's
 * #... part.
 */
export const MLFLOW_UI_ROUTE = 'mlflow-ui';

// Where an MLflow UI page without a counterpart in this app opens.
const FALLBACK_PROJECT_PATH = 'experiments';

function decodeSegment(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

/**
 * Where an MLflow UI address opens in this app, as a path under /projects/<project>/.
 * MLflow clients print "View run" and "View experiment" links as
 * <tracking URI>/#/experiments/<experiment>/runs/<run> and
 * <tracking URI>/#/experiments/<experiment>.
 * Anything after the Run (an Artifact tab, a query such as ?workspace=) is dropped. Registered
 * model links name the model, which this route cannot look up, so they open the Models list.
 */
export function projectPathForMlflowUiHash(hash: string): string {
  const [route = ''] = hash.replace(/^#\/?/, '').split('?');
  const [section, experimentId, child, runId] = route.split('/').filter(Boolean).map(decodeSegment);
  if (section === 'models') return 'models';
  if (section !== 'experiments' || !experimentId) return FALLBACK_PROJECT_PATH;
  if (child === 'runs' && runId) return `runs/${encodeURIComponent(runId)}`;
  return `experiments?${new URLSearchParams({ experiment: experimentId })}`;
}
