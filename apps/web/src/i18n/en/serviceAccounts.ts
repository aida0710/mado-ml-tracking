import type { TokenScope } from '@mmt/contracts';

// Service Accounts, the Project token list and the token dialog on the settings page.
export const serviceAccountsText = {
  serviceAccounts: "Service accounts",
  serviceAccountsDescription:
    "An account independent of a person. Worker and automation tokens issued here keep working even if the issuer leaves the project.",
  serviceAccountsEmpty: "No service accounts yet",
  newServiceAccount: "Create service account",
  editServiceAccount: "Edit service account",
  serviceAccountStatus: "Status",
  serviceAccountActive: "Enabled",
  serviceAccountDisabled: "Disabled",
  serviceAccountRoleMissing: "No role",
  disableServiceAccount: "Disable",
  enableServiceAccount: "Enable",
  issueToken: "Issue API token",
  personalTokens: "My API tokens",
  projectTokens: "Project tokens",
  projectTokensDescription:
    "All user and service account tokens limited to this project. Token values are not displayed.",
  projectTokensEmpty: "No tokens for this project",
  ownerTransfer: "Transfer to service account",
  ownerTransferTarget: "Destination service account",
  ownerTransferred: "Ownership transferred.",
  tokenOwner: "Owner",
  tokenOwnerUser: "User",
  tokenOwnerServiceAccount: "Service account",
  tokenPrefix: "Prefix",
  legacyToken: "Legacy",
  legacyTokenHint:
    "A service token owned by a person. It stops when the owner leaves the project. Replace it with a service account token.",
  tokenUsage: "Configuration example",
  tokenAuthentication: "Authentication method",
  tokenAuthenticationBearer: "Bearer (default for MLflow and Mado SDK)",
  tokenAuthenticationBasic: "Basic (tools using username/password; put the token in password)",
} as const;

// One line per scope, shown next to the scope in the token dialog.
export const tokenScopeLabels: Record<TokenScope, string> = {
  read: "read — Read",
  'runs:write': "runs:write — Create and record runs",
  'registry:write': "registry:write — Register models and datasets",
  'artifacts:write': "artifacts:write — Store artifacts",
  'jobs:write': "jobs:write — Launch and cancel jobs",
  'worker:execute': "worker:execute — Execute jobs as a worker",
  admin: "admin — Manage project",
};

// Text that embeds values.
export const serviceAccountsTextTemplates = {
  tokenExpiryDays: (days: number) => `${days} days`,
  serviceAccountTokenTitle: (name: string) => `Issue token for ${name}`,
  disableServiceAccountConfirm: (name: string) =>
    `Disable “${name}”? All tokens of this service account will stop working from the next request.`,
};
