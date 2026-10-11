// The guide to recording from the Mado Python SDK and the MLflow 3 SDK, on the Project settings
// page and the Experiments page.
export const connectionText = {
  recordingConnection: "Connect from SDK or MLflow 3",
  recordingConnectionIssueToken: "Issue API token for this project",
  recordingGuideToggle: "Record with SDK",
  projectId: "Project ID",
  experimentId: "Experiment ID",
  recordingWithSdk: "Python SDK (mado-tracking)",
  recordingWithMlflow: 'MLflow 3',
  recordingSdkInstall: "Install (Python 3.11 or later)",
  recordingEnvironment: "Environment variables (enter the token when running)",
  recordingPython: "Python example",
  recordingSdkExperimentByName:
    'Pass experiment_name="experiment name" to start_run to choose the experiment by name instead of ID. If no experiment has that name, one is created.',
  recordingSdkNamedExperiment:
    "If no experiment named experiment_name exists, one is created. Select an experiment in Experiments and open “Record with SDK” to get an example with that experiment's ID.",
  mlflowConnectionMore: "Service account tokens / Basic authentication",
  mlflowConnectionServiceAccountHint:
    "Use a service account token for long-running automation and workers. SSO user tokens stop working seven days after the last group verification.",
  mlflowConnectionBasic: "Basic authentication (for tools using username/password; put the token in password)",
} as const;
