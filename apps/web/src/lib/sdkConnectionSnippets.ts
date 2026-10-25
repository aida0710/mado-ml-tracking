import { clientApiUrl } from './clientApiUrl';
import { madoTrackingInstallLines } from './madoTrackingPackage';
import { pythonString } from './pythonSnippet';
import { exportLine, joinLines, promptedSecretLines } from './shellSnippet';
import { EXAMPLE_EXPERIMENT_NAME } from './tokenUsageSnippet';

/** SDKとMLflowの案内の、Python SDKのタブでコピーできるもの。 */
export interface SdkConnectionSnippets {
  install: string;
  environment: string;
  python: string;
}

// pages/tracking/sdk.mdは、学習コードの隣の仮想環境にインストールする。telemetryは
// system_metrics=TrueのGPUとメモリのメトリクスを足す。
const SDK_VENV_DIRECTORY = '.venv';
const SDK_INSTALL_EXTRAS = ['telemetry'];
const EXAMPLE_RUN_NAME = 'first-run';

/**
 * Python SDK（mado-tracking）の、このProjectについての設定。選んだExperimentがあればその
 * Experimentについての設定（MMT_EXPERIMENT_ID）も含む。無ければ例は代わりにExperimentの名前を
 * 書き、start_runはそのExperimentが無ければ作る。tokenはMLflowの例と同じく端末から読み込む。
 */
export function buildSdkConnectionSnippets(settings: {
  origin: string;
  projectId: string;
  experimentId?: string;
}): SdkConnectionSnippets {
  const environment = joinLines([
    exportLine('MMT_API_URL', clientApiUrl(settings.origin)),
    exportLine('MMT_PROJECT_ID', settings.projectId),
    ...(settings.experimentId ? [exportLine('MMT_EXPERIMENT_ID', settings.experimentId)] : []),
    ...promptedSecretLines('MMT_API_TOKEN'),
  ]);
  const experimentArgument = settings.experimentId
    ? ''
    : `experiment_name=${pythonString(EXAMPLE_EXPERIMENT_NAME)}, `;
  return {
    install: joinLines(
      madoTrackingInstallLines({ venvDirectory: SDK_VENV_DIRECTORY, extras: SDK_INSTALL_EXTRAS }),
    ),
    environment,
    python: `import mado_tracking

with mado_tracking.start_run(${experimentArgument}name=${pythonString(EXAMPLE_RUN_NAME)}) as run:
    run.log_params({"learning_rate": 2e-5})
    run.log_metrics({"train.loss": 0.42}, step=1)
`,
  };
}
