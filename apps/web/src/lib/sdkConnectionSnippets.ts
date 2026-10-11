import { clientApiUrl } from './clientApiUrl';
import { madoTrackingInstallLines } from './madoTrackingPackage';
import { pythonString } from './pythonSnippet';
import { exportLine, joinLines, promptedSecretLines } from './shellSnippet';
import { EXAMPLE_EXPERIMENT_NAME } from './tokenUsageSnippet';

/** What the Python SDK tab of the SDK and MLflow guide offers to copy. */
export interface SdkConnectionSnippets {
  install: string;
  environment: string;
  python: string;
}

// pages/tracking/sdk.md installs into a virtual environment next to the training code; telemetry
// adds the GPU and memory metrics of system_metrics=True.
const SDK_VENV_DIRECTORY = '.venv';
const SDK_INSTALL_EXTRAS = ['telemetry'];
const EXAMPLE_RUN_NAME = 'first-run';

/**
 * The Mado SDK's settings for this Project, and for the chosen Experiment when there is one
 * (MMT_EXPERIMENT_ID). Without one, the example names an Experiment instead, which start_run
 * creates when it does not exist. The token is read from the terminal as in the MLflow example.
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
