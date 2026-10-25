import { TOKEN_PURPOSE_LABELS, type TokenScope } from '@mmt/contracts';
import type { TokenPurposeOption } from '../../lib/tokenPurposes';

// 設定の画面のService Account、Projectのtokenの一覧、tokenのダイアログ。
export const serviceAccountsText = {
  serviceAccounts: 'Service accounts',
  serviceAccountsDescription:
    'An account independent of a person. Worker and automation tokens issued here keep working even if the issuer leaves the project.',
  serviceAccountsEmpty: 'No service accounts yet',
  newServiceAccount: 'Create service account',
  editServiceAccount: 'Edit service account',
  serviceAccountActive: 'Enabled',
  serviceAccountDisabled: 'Disabled',
  serviceAccountRoleMissing: 'No role',
  serviceAccountRoleHint:
    'Use Admin to run jobs as a worker (worker:execute requires Admin), Editor to record runs from the SDK or CI, or Viewer for read-only access.',
  disableServiceAccount: 'Disable',
  enableServiceAccount: 'Enable',
  issueToken: 'Issue API token',
  personalTokens: 'My API tokens',
  projectTokens: 'Project tokens',
  projectTokensDescription:
    'All user and service account tokens limited to this project. Token values are not displayed.',
  projectTokensEmpty: 'No tokens for this project',
  ownerTransfer: 'Transfer to service account',
  ownerTransferTarget: 'Destination service account',
  ownerTransferred: 'Ownership transferred.',
  tokenOwner: 'Owner',
  tokenOwnerUser: 'User',
  tokenOwnerServiceAccount: 'Service account',
  tokenPrefix: 'Prefix',
  tokenUsage: 'Configuration example',
  tokenAuthentication: 'Authentication method',
  tokenAuthenticationBearer: 'Bearer (default for MLflow and Mado SDK)',
  tokenAuthenticationBasic: 'Basic (tools using username/password; put the token in password)',
  tokenNameHint: 'Use a name that shows where the token is used (e.g., laptop-notebook).',
  tokenPurpose: 'Purpose',
  tokenPurposeHint:
    'Choosing a purpose selects the scopes it needs. Changing the scopes switches to “Choose scopes manually”.',
  tokenPurposeRequired: 'Choose a purpose or select at least one scope',
  tokenExpiryCustom: 'Custom duration',
  tokenExpiryCalendar: 'Choose from calendar',
  tokenExpiryDateTime: 'Expiry date and time',
  tokenExpiryDateInvalid: 'Choose a future expiry date and time',
  tokenExpiryDuration: 'Duration',
  tokenExpiryUnit: 'Unit',
  tokenExpiryMinutes: 'Minutes',
  tokenExpiryHours: 'Hours',
  tokenExpiryDays: 'Days',
  tokenExpiryInvalid: 'Enter a valid duration greater than zero',
  copyIssuedToken: 'Copy token',
  copyTokenUsage: 'Copy example',
  tokenUsageEnvironment: 'Environment variables (for both the Python SDK and MLflow 3)',
  tokenUsageHint:
    'The example does not include the token. Paste it into a terminal and run it; when asked for “API token:”, paste the token copied with “Copy token”. The token is not shown on screen and is not saved in the shell history.',
} as const;

// 発行の画面の用途と、その token でできること。名前は API の文と同じ contracts の英語を使う。
export const tokenPurposeLabels: Record<TokenPurposeOption, { label: string; hint: string }> = {
  recording: {
    label: TOKEN_PURPOSE_LABELS.recording,
    hint: "Record runs, register models and datasets, and store artifacts. Can also delete unused dataset versions; with a project administrator's token, artifacts can be deleted too",
  },
  jobSubmission: {
    label: TOKEN_PURPOSE_LABELS.jobSubmission,
    hint: 'Claim queued jobs on a manual-submission computer and submit them',
  },
  worker: {
    label: TOKEN_PURPOSE_LABELS.worker,
    hint: 'Receive and run jobs, and store their outputs',
  },
  readOnly: { label: TOKEN_PURPOSE_LABELS.readOnly, hint: 'Only read runs and models. Cannot record' },
  custom: { label: 'Choose scopes manually', hint: 'Select scopes one by one below' },
};

// scopeごとに1行。tokenのダイアログでscopeの隣に出す。
export const tokenScopeLabels: Record<TokenScope, string> = {
  read: 'read — Read',
  'runs:write': 'runs:write — Create and record runs',
  'registry:write': 'registry:write — Register models and datasets',
  'artifacts:write': 'artifacts:write — Store artifacts',
  'jobs:write': 'jobs:write — Launch and cancel jobs',
  'worker:execute': 'worker:execute — Execute jobs as a worker',
  admin: 'admin — Manage project',
  'tokens:manage': 'tokens:manage — Manage tokens and service accounts within this token',
  'audit:read': 'audit:read — Read the whole audit log',
  'users:manage': 'users:manage — Manage users',
};

// 値を埋め込む文言。
export const serviceAccountsTextTemplates = {
  tokenExpiryDays: (days: number) => `${days} days`,
  tokenExpiryTimezone: (timezone: string) => `Times use ${timezone}.`,
  serviceAccountTokenTitle: (name: string) => `Issue token for ${name}`,
  disableServiceAccountConfirm: (name: string) =>
    `Disable “${name}”? All tokens of this service account will stop working from the next request.`,
};
