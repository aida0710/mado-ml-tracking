import {
  GLOBAL_TOKEN_SCOPES,
  TOKEN_PURPOSE_LABELS,
  TOKEN_PURPOSE_SCOPES,
  TOKEN_PURPOSES,
  type TokenPurpose,
  type TokenScope,
} from '@mmt/contracts';
import { DomainError } from './errors.js';

/*
 * API token でできないことを頼まれたときの失敗。画面の設定を写した人が直せるように、足りない scope と
 * それを持つ token の発行のしかた、または token がどの Project のものかを伝える。画面は code と横の項目
 * （`scope`・`purpose`・`tokenProjectName`）から訳す。
 */

/**
 * その scope を持つ token の、発行の画面の用途。一覧で最初に出るものを選び、画面で見える選択肢を
 * 名指しする。admin を含む用途は無い。
 */
function purposeIncludingScope(scope: string): TokenPurpose | null {
  return (
    TOKEN_PURPOSES.find((candidate) =>
      TOKEN_PURPOSE_SCOPES[candidate].some((included) => included === scope),
    ) ?? null
  );
}

function howToIssueScope(scope: string, purpose: TokenPurpose | null): string {
  if (GLOBAL_TOKEN_SCOPES.includes(scope as TokenScope))
    return `a global administrator must issue a token with ${scope} without choosing a project`;
  return purpose
    ? `issue a new token with the purpose "${TOKEN_PURPOSE_LABELS[purpose]}" from Issue API token in Project settings`
    : `ask a project admin to issue a token with ${scope}`;
}

export function scopeRequiredError(scope: string): DomainError {
  const purpose = purposeIncludingScope(scope);
  return new DomainError({
    status: 403,
    code: 'scope_required',
    message: `the API token lacks the scope ${scope} required for this operation; ${howToIssueScope(scope, purpose)}`,
    details: { scope, purpose },
  });
}

export function tokenProjectMismatchError(tokenProjectName: string | null): DomainError {
  const owner = tokenProjectName ? `project "${tokenProjectName}"` : 'another project';
  return new DomainError({
    status: 403,
    code: 'project_forbidden',
    message: `the API token belongs to ${owner}; check the project ID of the destination (MMT_PROJECT_ID, MLFLOW_TRACKING_URI) or use a token issued in that project`,
    details: { tokenProjectName },
  });
}
