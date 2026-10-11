import {
  HOOK_WEBHOOK_TIMESTAMP_TOLERANCE_SECONDS,
  MAX_JOB_CHAIN_DEPTH,
  type HookCheckpointMode,
  type HookConcurrency,
  type HookExecutionStatus,
  type HookExecutionSubject,
  type HookSkipReason,
  type HookTrigger,
  type HookWebhookSignature,
} from '@mmt/contracts';

const SECONDS_PER_MINUTE = 60;

// The Hooks screen: the list, the create dialog, a hook's settings, manual starts and executions.
export const hooksText = {
  hooks: 'Hooks',
  hookList: "Hooks",
  hookExecutions: "Execution history",
  newHook: "Create hook",
  noHooks: "No hooks yet",
  noHookExecutions: "No execution history yet",
  hookTrigger: "Trigger",
  hookOwner: "Owner",
  hookOwnerHint: "Hooks launch jobs with this owner's permissions, and the owner becomes the run's creator.",
  hookTransferNoAccounts:
    "No other service accounts are available for transfer. Create an enabled service account with the editor or admin role in project settings.",
  hookFilter: "Trigger filters",
  hookFilterHint:
    "Empty fields do not filter. Non-matching events do not launch jobs or leave execution history.",
  hookFilterModelFamilies: "Model family",
  hookFilterExperiments: "Experiment",
  hookFilterRunKinds: "Run kind",
  hookFilterRunStatuses: "Run end status",
  hookFilterTags: "Run tags (JSON; all must match)",
  hookNoFilter: "No filter",
  hookTemplate: "Job to launch",
  hookModelVersion: "Model version",
  hookInheritModelVersion: "Use the triggering run's model version",
  hookRegisteredModelVersion: "Launches with the registered model version.",
  hookInheritOutputDatasets: "Also use the triggering run's output dataset versions as inputs",
  hookArraySize: "Array size (optional; blank creates a single job)",
  hookDatasetPartition: "Dataset version to split across the array (optional; version with files)",
  hookCheckpointMode: "Checkpoint launches",
  hookCheckpointEvery: "Launch every N checkpoints",
  hookConcurrency: "Events before the previous job finishes",
  hookMaxStartsPerHour: "Maximum launches per hour",
  hookLimits: "Launch limits",
  hookResources: "Resources per job",
  hookWebhookSignature: "Signature format",
  hookFixedSettings:
    "Only enabled/disabled status can be changed after creation. Create a new hook to change its settings.",
  hookEnabled: "Enabled",
  hookDisabled: "Disabled",
  hookStart: "Launch manually",
  hookStartPayload: "Payload (JSON, optional)",
  hookStartPayloadHint:
    "Available inside jobs as /mmt/context/trigger-payload.json (environment variable MMT_TRIGGER_PAYLOAD_FILE).",
  hookStartConfirm: "Launch",
  hookWebhookCreated: "Webhook settings",
  hookWebhookSecret: "Signing secret",
  hookWebhookPath: "Endpoint path",
  hookWebhookSecretOnce:
    "The secret is shown only once. Configure it at the sender before closing this screen.",
  hookWebhookPathHint:
    "Register a URL consisting of your public API host and this path at the sender. Requests with invalid signatures or to disabled hooks are rejected.",
  hookManualSiteNotice:
    "This is a manually submitted site. Hook-created jobs wait until the owner runs mado-tracking submit on the site's login node.",
  hookExecutionSubject: "Resource",
  hookExecutionOutcome: "Outcome",
  hookExecutionLinks: "Related",
  hookExecutionWaitingRun: "Waiting for run",
  hookExecutionRequestedBy: "Launched by",
  hookAllHooks: "All hooks",
  hookShowExecutions: "View execution history",
  hookViewFilter: "Hook to display",
  hookNameError: "Enter a hook name.",
  hookTriggerError: "Select a trigger.",
  hookTargetError: "Select an enabled computer supporting the selected code version's runtime.",
  hookCodeError: "Select a code version supporting the run kind and model family.",
  hookReferenceError: "Select an experiment, model version, and dataset versions from this project.",
  hookPartitionError:
    "To split a dataset across an array, specify an array size and select a dataset version with files.",
  hookSignatureError: "Select a signature format.",
} as const;

export const hookTriggerLabels: Record<HookTrigger, string> = {
  manual: "Manual / Launch API",
  model_registered: "Model version registered",
  run_finished: "Run ended",
  array_finished: "Array ended",
  checkpoint_saved: "Checkpoint saved",
  webhook: "External webhook",
};

export const hookCheckpointModeLabels: Record<HookCheckpointMode, string> = {
  every: "Every checkpoint",
  every_k: "Every N checkpoints",
  latest: "Latest only (coalesce new checkpoints during evaluation)",
  skip_if_running: "Skip while running",
};

export const hookConcurrencyLabels: Record<HookConcurrency, string> = {
  queue: "Launch all",
  skip_if_running: "Wait for the previous job to finish",
};

export const hookWebhookSignatureLabels: Record<HookWebhookSignature, string> = {
  github: 'GitHub（X-Hub-Signature-256）',
  mmt: 'MMT（X-MMT-Signature）',
};

// How the sender signs each delivery, shown next to the secret right after creation.
export const hookWebhookSignatureHints: Record<HookWebhookSignature, string> = {
  github:
    "For GitHub webhooks, set Content type to application/json and this signing secret as Secret. Redeliveries with the same X-GitHub-Delivery are treated as one event.",
  mmt: `The sender must include X-MMT-Signature: t=<unix seconds>,v1=<hex HMAC-SHA256(secret, "<t>.<body>")> and X-MMT-Delivery for deduplication. Clock skew of up to ${HOOK_WEBHOOK_TIMESTAMP_TOLERANCE_SECONDS / SECONDS_PER_MINUTE} minutes is accepted.`,
};

export const hookExecutionStatusLabels: Record<HookExecutionStatus, string> = {
  pending: "Waiting for run to finish",
  queued: "Job created",
  skipped: "Not launched",
  failed: "Launch failed",
};

export const hookSkipReasonLabels: Record<HookSkipReason, string> = {
  loop_detected: "This hook already ran in the same chain",
  chain_too_deep: `Chain depth exceeds the limit (${MAX_JOB_CHAIN_DEPTH} stages)`,
  rate_limited: "Maximum launches per hour",
  already_running: "Previous job has not finished",
  owner_access_revoked: "Owner lost project permissions",
  superseded: "Replaced by a newer checkpoint",
  source_run_unsuccessful: "Triggering run failed or stopped",
  source_run_timeout: "Run completion deadline exceeded",
  hook_disabled: "Hook disabled",
};

export const hookExecutionSubjectLabels: Record<HookExecutionSubject, string> = {
  manual: "Manual",
  model_version: "Model version",
  run: 'Run',
  array_group: 'array',
  checkpoint: 'checkpoint',
  webhook: 'webhook',
};

// Text that embeds values.
export const hooksTextTemplates = {
  hookSkipped: (reason: string) => `Not launched (${reason})`,
  hookTransferConfirm: (hookName: string, accountName: string) =>
    `Transfer ownership of “${hookName}” to ${accountName}? Future hook launches will use this service account's permissions.`,
  hookEnableConfirm: (name: string) =>
    `Enable “${name}”? Future events will launch jobs with the owner's permissions.`,
  hookDisableConfirm: (name: string) =>
    `Disable “${name}”? Future events and pending executions will no longer launch jobs.`,
  hookStartConfirm: (name: string) =>
    `Launch “${name}” and create a job with the owner's permissions?`,
  hookCheckpointEveryError: (max: number) =>
    `Checkpoint interval must be an integer from 1 to ${max}.`,
  hookMaxStartsError: (max: number) =>
    `Maximum launches per hour must be an integer from 1 to ${max}.`,
  hookPayloadTooLarge: (maxKiB: number) => `Payload must not exceed ${maxKiB}KiB.`,
  hookCheckpointEveryK: (every: number) => `Every ${every} checkpoints`,
  hookStarted: (outcome: string) =>
    `Launch accepted (${outcome}). Check execution history for the outcome.`,
};
