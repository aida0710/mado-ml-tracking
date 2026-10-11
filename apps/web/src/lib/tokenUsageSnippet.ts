import { exportFromVariableLine, exportLine, joinLines, promptedSecretLines } from './shellSnippet';
import { pythonString } from './pythonSnippet';
import { clientApiUrl } from './clientApiUrl';

/**
 * Shell settings that point the MLflow SDK and the Mado SDK at a Project with a new token.
 * Bearer is what both SDKs send by default; Basic is for tools that only accept a user name and
 * a password, where the password is the token and the user name is not checked.
 */
export type TokenAuthentication = 'bearer' | 'basic';

// MLFLOW_TRACKING_USERNAME must be non-empty for the SDK to send Basic; the API ignores it.
const BASIC_USERNAME_PLACEHOLDER = 'mado';

export function mlflowTrackingUri(origin: string, projectId: string): string {
  return `${clientApiUrl(origin)}/api/mlflow/projects/${encodeURIComponent(projectId)}`;
}

/**
 * The settings shown right after a token is issued, for both SDKs at once. Like every other
 * example on the screen, it holds no token: the token is pasted at the `read -s` prompt, so it
 * stays out of the snippet and the shell history, and MLflow takes it from MMT_API_TOKEN.
 */
export function buildTokenUsageSnippet(settings: {
  origin: string;
  projectId: string;
  authentication: TokenAuthentication;
}): string {
  const apiUrl = clientApiUrl(settings.origin);
  const trackingUri = mlflowTrackingUri(apiUrl, settings.projectId);
  return joinLines([
    exportLine('MMT_API_URL', apiUrl),
    exportLine('MMT_PROJECT_ID', settings.projectId),
    ...promptedSecretLines('MMT_API_TOKEN'),
    exportLine('MLFLOW_TRACKING_URI', trackingUri),
    exportLine('MLFLOW_REGISTRY_URI', trackingUri),
    ...(settings.authentication === 'basic'
      ? [
          exportLine('MLFLOW_TRACKING_USERNAME', BASIC_USERNAME_PLACEHOLDER),
          exportFromVariableLine('MLFLOW_TRACKING_PASSWORD', 'MMT_API_TOKEN'),
        ]
      : [exportFromVariableLine('MLFLOW_TRACKING_TOKEN', 'MMT_API_TOKEN')]),
  ]);
}

/** What the MLflow 3 tab of the SDK and MLflow guide offers to copy. */
export interface MlflowConnectionSnippets {
  trackingUri: string;
  // The Model Registry lives under the same Project URL as tracking.
  registryUri: string;
  bearerEnvironment: string;
  basicEnvironment: string;
  python: string;
}

// The experiment the examples record into when the page has none chosen; MLflow's set_experiment
// and the Mado SDK's experiment_name create it when it does not exist yet.
export const EXAMPLE_EXPERIMENT_NAME = 'my-experiment';

/**
 * Settings shown before any token exists, so the token is read from the terminal with `read -s`
 * instead of being written into the snippet, the shell history or the page. The Python example
 * records into `experimentName`.
 */
export function buildMlflowConnectionSnippets(settings: {
  origin: string;
  projectId: string;
  experimentName?: string;
}): MlflowConnectionSnippets {
  const trackingUri = mlflowTrackingUri(settings.origin, settings.projectId);
  const uriLines = [
    exportLine('MLFLOW_TRACKING_URI', trackingUri),
    exportLine('MLFLOW_REGISTRY_URI', trackingUri),
  ];
  return {
    trackingUri,
    registryUri: trackingUri,
    bearerEnvironment: joinLines([...uriLines, ...promptedSecretLines('MLFLOW_TRACKING_TOKEN')]),
    basicEnvironment: joinLines([
      ...uriLines,
      exportLine('MLFLOW_TRACKING_USERNAME', BASIC_USERNAME_PLACEHOLDER),
      ...promptedSecretLines('MLFLOW_TRACKING_PASSWORD'),
    ]),
    python: mlflowPythonExample(settings.experimentName ?? EXAMPLE_EXPERIMENT_NAME),
  };
}

// The SDK reads the URI and the token from the environment, so the code itself has no settings.
function mlflowPythonExample(experimentName: string): string {
  return `import mlflow

mlflow.set_experiment(${pythonString(experimentName)})
with mlflow.start_run():
    mlflow.log_param("learning_rate", 2e-5)
    mlflow.log_metric("train.loss", 0.42, step=1)
`;
}
