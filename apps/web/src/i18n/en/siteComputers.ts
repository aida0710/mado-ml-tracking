import type {
  SiteAccountMode,
  SiteConnectionCheckStatus,
  SiteGpuAssignment,
  SiteKeyStatus,
} from '@mmt/contracts';
import type { JobShellTemplateKey } from "../../lib/jobShellTemplates";

// Computers added on the Web: the site settings of the target dialog, the owner in the lists, and
// a site's details (job shell, keys and checks, personal settings, submit).
export const siteComputersText = {
  siteSubmissionSection: "Submission and connection",
  siteExecutionSection: "Site execution",
  siteAdvancedSettings: "Details",
  jobShellSection: 'job shell',
  launcherId: "Launcher",
  launcherUnset: "(select an option)",
  noLaunchersNotice:
    "No launchers are registered yet. A global administrator can register one in Administration → Launchers.",
  siteHost: "Connection host",
  sitePort: "Connection port",
  siteJumpHosts: "Jump hosts (one per line, [user@]host[:port])",
  siteKnownHosts: "known_hosts (destination and jump host entries)",
  siteKnownHostsHint:
    "Verify ssh-keyscan output against the host key fingerprint before pasting it. The launcher rejects host keys not listed here.",
  accountMode: "Login account",
  sharedAccount: "Shared account name",
  siteWorkDirectory: "Working directory (absolute path also accessible from compute nodes)",
  runnerPython: "Runner Python (3.11 or later)",
  runnerApiUrl: "API URL reachable by the runner (optional)",
  runnerApiUrlPlaceholder: 'https://mmt-runner.example.org',
  cancelCommand: "Cancel command (optional; reads MMT_SCHEDULER_JOB_ID)",
  gpuAssignment: "GPU assignment",
  leaseGpuIds: "Allowed GPUs (one per line; blank allows all)",
  siteVariables: "Variables (one NAME=VALUE per line; passed to job shell as MMT_VAR_NAME)",
  maxActiveSubmissions: "Jobs claimed at once",
  cancelGraceSeconds: "Cancellation grace period (seconds)",
  maxOutputFiles: "Output limit (files per job)",
  siteExecutionHint:
    "If the runner API URL is blank, the launcher's URL is used (or mado-tracking submit's URL for manual submission). On personal-account and manual-submission computers, users can override the working directory and variables in My settings. Shared-account computers do not allow these overrides.",
  jobShellTemplate: "Job shell template",
  jobShellTemplateNone: "No template",
  jobShellTemplateHint:
    "Selecting a template replaces the job shell, cancel command, array support, GPU assignment, and supported runtimes. Templates are examples; adjust queue names, resources, and groups to your site's documentation.",
  jobShell: 'job shell',
  siteLauncherRequired: "Select a launcher for automatic submission computers.",
  siteHostError:
    "Connection hosts may contain only letters, numbers, dots, colons, underscores, and hyphens. They must not start with a hyphen.",
  siteKnownHostsRequired:
    "Enter known_hosts. The launcher rejects unknown host keys.",
  siteKnownHostsLineError:
    "Each known_hosts line must use “host key-type key” format. Lines starting with # are comments.",
  siteSharedAccountRequired: "Enter a shared account name.",
  siteAccountNameRequired: "Enter your account name.",
  siteAccountNameError:
    "Account names must start with a letter, number, or underscore and contain only letters, numbers, dots, underscores, and hyphens (up to 64 characters).",
  siteWorkDirectoryError:
    "Working directories must be absolute paths starting with / and contain only letters, numbers, and ._/+@-.",
  siteWorkDirectoryRequired: "Enter a working directory for shared-account computers.",
  runnerPythonError:
    "Runner Python must be a command or path containing only letters, numbers, and ._/+@-.",
  runnerApiUrlError:
    "Runner API URLs must start with http:// or https://.",
  jobShellRequired: "Enter a job shell or select a template.",
  // The owner column: a computer from before owners is everyone's (global administrators manage it).
  targetOwnerGlobal: "Global",
  targetOwnerSelf: "Personal",
  jobShellCurrent: "Current version",
  jobShellNone: "No job shell yet. Jobs will not be submitted on this computer until one is saved.",
  jobShellEdit: "Edit job shell",
  jobShellSave: "Save as new version",
  jobShellLoadTemplate: "Load template",
  jobShellLoadTemplateHint:
    "Loading a template replaces the content being edited. Settings such as the cancel command stay unchanged; update them by editing the computer.",
  jobShellUnchanged: "No new version was created because the content matches the current version.",
  jobShellHistory: "Version history",
  jobShellHistoryHint: "Jobs record the version used for submission. Saved versions are immutable.",
  jobShellVersion: "Version",
  jobShellCreatedBy: "Saved by",
  jobShellCreatedAt: "Saved at",
  jobShellShow: "Show",
  jobShellShowCurrent: "Show current version",
  siteKeysTitle: "Keys and connection check",
  siteKeysNoLauncher:
    "Keys cannot be created until a launcher is selected. Select one by editing the computer.",
  siteKeyRequested:
    "Waiting for the launcher to generate a key. The public key appears when it next reads the configuration.",
  siteKeyNone: "No key yet.",
  siteKeyFingerprint: "Fingerprint",
  siteKeyStatus: "Key status",
  siteKeyReadyAt: "Created at",
  siteKeyRequestedAt: "Requested at",
  siteKeyRotate: "Rotate key",
  siteKeyRequest: "Request key",
  siteKeyRotateConfirm:
    "Revoke the current key and have the launcher generate a new one? Submission to this account fails until the new public key is added to authorized_keys.",
  siteConnectionCheckHint:
    "The launcher signs in once using this key and account and runs only true. No job is submitted.",
  siteConnectionChecks: "Check results",
  siteConnectionCheckNone: "Not checked yet.",
  siteConnectionCheckMessage: "Launcher report",
  sitePersonalTitle: "My settings",
  sitePersonalHint:
    "Settings used when submitting your jobs on this computer. Blank fields use the computer's settings.",
  sitePersonalSharedAccountNotice:
    "This computer uses a shared account and has no personal settings. All jobs use the same account, working directory, and variables.",
  siteAccountName: "Your account name",
  siteAccountRequiredNotice:
    "This computer uses each user's own account. You cannot create jobs until you save your account name. The launcher then generates a key for you.",
  sitePersonalWorkDirectory: "Working directory (optional; overrides computer settings)",
  sitePersonalVariables: "Variables (optional; one NAME=VALUE per line; overrides computer variables)",
  sitePersonalSave: "Save my settings",
  sitePersonalSaved: "Personal settings saved.",
  sitePersonalDelete: "Clear my settings",
  sitePersonalDeleteConfirm:
    "Clear your settings? On personal-account computers, your key will also be revoked and you cannot create jobs until reconfigured.",
  sitePersonalNone: "Not saved yet.",
  sitePersonalKeyTitle: "Your key",
  sitePersonalListTitle: "User settings",
  sitePersonalListUser: "User",
  sitePersonalListAccount: "Account",
  sitePersonalListVariables: "Variables",
  sitePersonalListKey: "Key",
  sitePersonalListUpdatedAt: "Updated at",
  sitePersonalListEmpty: "No users have saved settings for this computer yet.",
  siteUsesComputerSetting: "Computer settings",
  manualGuideTitle: "Submit with mado-tracking submit",
  manualGuideHint:
    "Jobs on this computer are submitted manually. The requester runs this command on the computer using their own API token.",
  manualGuideOnce: "Submit your queued jobs once on the login node",
  manualGuideWatch: "Listen on your PC (submit repeatedly until stopped)",
  manualGuideAll:
    "Owner: listen for other users' jobs on a public computer and submit them using your account",
  manualGuideAllScope:
    "--all receives jobs from the token's project. To handle multiple projects, run --watch --all separately with each project's token.",
  submitSetupTitle: "Before your first submission (install the command, connection URL, API token)",
  submitSetupInstall: "Install mado-tracking and add it to PATH (Python 3.11 or later)",
  submitSetupToken:
    "Issue the API token in the project where the job was created: open “Project settings” → “My API tokens”, click “Issue API token”, and select read and jobs:write.",
  submitSetupIssueToken: "Issue API token for submission",
  submitSetupEnvironment: "Connection URL and API token (enter the token when running)",
} as const;

// Text that embeds values.
export const siteComputersTextTemplates = {
  // Someone else's manual computer may be their PC (they take everyone's Jobs) or, for example, a
  // supercomputer each requester submits to with their own account.
  manualGuideOwnerSubmits: (owner: string) =>
    `This computer belongs to ${owner}. If the owner is listening with --watch --all (e.g. on their PC), jobs are submitted by the owner.`,
  siteJumpHostError: (value: string) =>
    `Enter jump host “${value}” as [user@]host[:port].`,
  siteJumpHostsTooMany: (max: number) => `At most ${max} jump hosts are allowed.`,
  siteKnownHostsTooLarge: (kib: number) => `known_hosts must not exceed ${kib} KiB.`,
  siteVariableLineError: (line: string) =>
    `Variable “${line}” must use NAME=VALUE format. NAME must start with a letter or underscore and contain only letters, numbers, and underscores.`,
  siteVariableDuplicate: (name: string) => `Variable ${name} is defined twice.`,
  siteVariablesTooMany: (max: number) => `At most ${max} variables are allowed.`,
  siteNumberRangeError: (label: string, min: number, max: number) =>
    `Enter ${label} as an integer from ${min} to ${max}.`,
  jobShellTooLarge: (mib: number) => `Job shell must not exceed ${mib} MiB.`,
  jobShellVersionLabel: (version: number) => `v${version}`,
  jobShellShowing: (version: number) => `Viewing version ${version}`,
  jobShellSaved: (version: number) => `Version ${version} saved. It will be used for future submissions.`,
  siteSharedKeyHint: (account: string) =>
    `Public key generated by the launcher. Add it as one line to ~/.ssh/authorized_keys for shared account ${account}. The private key stays on the launcher host.`,
  sitePersonalKeyHint: (account: string) =>
    `Public key generated by the launcher for you. Add it as one line to ~/.ssh/authorized_keys for your account ${account}. The private key stays on the launcher host.`,
};

export const siteAccountModeLabels = {
  shared: "Shared account (all jobs use one account)",
  personal: "Personal accounts (each user specifies an account in My settings)",
} satisfies Record<SiteAccountMode, string>;

export const siteGpuAssignmentLabels = {
  scheduler: "Assigned by scheduler",
  lease: "Runner selects available host GPUs (no scheduler)",
} satisfies Record<SiteGpuAssignment, string>;

export const jobShellTemplateLabels = {
  pbs: "PBS Professional (ABCI 3.0 example)",
  slurm: "Slurm (shared account example)",
  'grid-engine': "Grid Engine (TSUBAME4.0 example)",
  'fujitsu-tcs': "Fujitsu TCS (Fugaku example)",
  'direct-docker': "GPU host without scheduler (Docker)",
  'direct-apptainer': "GPU host without scheduler (Apptainer)",
} satisfies Record<JobShellTemplateKey, string>;

export const siteKeyStatusLabels = {
  requested: "Pending creation",
  ready: "Created",
} satisfies Record<SiteKeyStatus, string>;

export const siteConnectionCheckStatusLabels = {
  queued: "Checking",
  succeeded: "Success",
  failed: "Failed",
} satisfies Record<SiteConnectionCheckStatus, string>;
