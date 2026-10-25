import { exportFromVariableLine, exportLine, joinLines, promptedSecretLines } from './shellSnippet';
import { pythonString } from './pythonSnippet';
import { clientApiUrl } from './clientApiUrl';

/**
 * MLflowのSDKとPython SDK（mado-tracking）を、新しいtokenでProjectへ向けるシェルの設定。
 * Bearerは両方のSDKが既定で送る方式。Basicはユーザー名とパスワードしか受け付けないツール向けで、
 * パスワードがtokenになり、ユーザー名は確かめない。
 */
export type TokenAuthentication = 'bearer' | 'basic';

// SDKがBasicを送るにはMLFLOW_TRACKING_USERNAMEが空でない必要がある。APIはこの値を無視する。
const BASIC_USERNAME_PLACEHOLDER = 'mado';

export function mlflowTrackingUri(origin: string, projectId: string): string {
  return `${clientApiUrl(origin)}/api/mlflow/projects/${encodeURIComponent(projectId)}`;
}

/**
 * tokenを発行した直後に出す、両方のSDK向けの設定。画面のほかの例と同じくtokenは含めない。
 * tokenは`read -s`のプロンプトに貼り付けるので、例の文にもシェルの履歴にも残らず、MLflowは
 * MMT_API_TOKENからtokenを受け取る。
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

/** SDKとMLflowのガイドのMLflow 3のタブで、コピーできるようにするもの。 */
export interface MlflowConnectionSnippets {
  trackingUri: string;
  // Model Registryは、trackingと同じProjectのURLの下にある。
  registryUri: string;
  bearerEnvironment: string;
  basicEnvironment: string;
  python: string;
}

// 画面で選ばれたExperimentが無いときに例が記録する先。MLflowのset_experimentと
// Python SDK（mado-tracking）のexperiment_nameは、まだ無ければこれを作る。
export const EXAMPLE_EXPERIMENT_NAME = 'my-experiment';

/**
 * tokenがまだ無いときに出す設定。そのためtokenは、例の文やシェルの履歴、画面に書かず、
 * ターミナルから`read -s`で読む。Pythonの例は`experimentName`へ記録する。
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

// SDKはURIとtokenを環境変数から読むので、コード自体には設定が無い。
function mlflowPythonExample(experimentName: string): string {
  return `import mlflow

mlflow.set_experiment(${pythonString(experimentName)})
with mlflow.start_run():
    mlflow.log_param("learning_rate", 2e-5)
    mlflow.log_metric("train.loss", 0.42, step=1)
`;
}
