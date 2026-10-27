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
 * （`scope`・`purpose`・`tokenProjectName`）から組み立てられる。
 */

/**
 * 足りない scope を持つ token の、発行の画面の用途。今の token の scope もすべて含む用途を先に選ぶ
 * （worker の token に artifacts:write が足りないなら、記録用ではなく worker 用を勧める）。無ければ
 * その scope を含む用途のうち一覧で最初に出るもの。admin を含む用途は無い。
 */
function purposeIncludingScope(scope: string, heldScopes: readonly string[]): TokenPurpose | null {
  const candidates = TOKEN_PURPOSES.filter((candidate) =>
    TOKEN_PURPOSE_SCOPES[candidate].some((included) => included === scope),
  );
  const coversHeldScopes = (candidate: TokenPurpose) =>
    heldScopes.every((held) => TOKEN_PURPOSE_SCOPES[candidate].some((included) => included === held));
  return candidates.find(coversHeldScopes) ?? candidates[0] ?? null;
}

function howToIssueScope(scope: string, purpose: TokenPurpose | null): string {
  if (GLOBAL_TOKEN_SCOPES.includes(scope as TokenScope))
    return `a global administrator must issue a token with ${scope} without choosing a project`;
  // 用途の名前は画面の言語で違うので、どの言語でも同じ scope の名前を添える。
  return purpose
    ? `issue a new token with the purpose "${TOKEN_PURPOSE_LABELS[purpose]}" (scopes: ${TOKEN_PURPOSE_SCOPES[purpose].join(', ')}) from Issue API token in Project settings`
    : `ask a project admin to issue a token with ${scope}`;
}

export function scopeRequiredError(scope: string, heldScopes: readonly string[]): DomainError {
  const purpose = purposeIncludingScope(scope, heldScopes);
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
