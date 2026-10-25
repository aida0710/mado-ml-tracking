import {
  TOKEN_PURPOSE_SCOPES,
  TOKEN_PURPOSES,
  type ProjectRole,
  type TokenPurpose,
  type TokenScope,
} from '@mmt/contracts';
import { scopesAllowedForRole } from './tokenScopes';

/**
 * tokenのダイアログの「用途」の選択肢。用途（その使い方に要るscope。contractsで決める）か、
 * scopeを1つずつ選ぶ`custom`。
 */
export type TokenPurposeOption = TokenPurpose | 'custom';

// ダイアログに並べる順。用途は決められた順に並べ、自由に選ぶものは最後。
const TOKEN_PURPOSE_OPTION_ORDER: readonly TokenPurposeOption[] = [...TOKEN_PURPOSES, 'custom'];

/** tokenのダイアログで選んだ用途と、それが表すscope。 */
export interface TokenScopeChoice {
  purpose: TokenPurposeOption;
  scopes: TokenScope[];
}

/** tokenを受け取る人。ログインしている本人か、ProjectのService Account。 */
export interface TokenOwnerKind {
  role: ProjectRole;
  isServiceAccount: boolean;
}

/**
 * この持ち主にtokenを発行できる用途。持ち主のロールがすべてのscopeを許すもの。workerは人の手を
 * 離れて動くので、人のtokenではなくService Accountのtokenを使う。人のtokenは、その人が
 * Projectを抜けると止まる。
 */
export function purposesForOwner(owner: TokenOwnerKind): TokenPurposeOption[] {
  const allowed = scopesAllowedForRole(owner.role);
  return TOKEN_PURPOSE_OPTION_ORDER.filter((purpose) => {
    if (purpose === 'custom') return true;
    if (purpose === 'worker' && !owner.isServiceAccount) return false;
    return TOKEN_PURPOSE_SCOPES[purpose].every((scope) => allowed.includes(scope));
  });
}

/** scopeが`scopes`とちょうど同じ（順不同）用途。無ければ`custom`。 */
export function purposeForScopes(
  scopes: readonly TokenScope[],
  purposes: readonly TokenPurposeOption[],
): TokenPurposeOption {
  const matching = purposes.find(
    (purpose) =>
      purpose !== 'custom' &&
      TOKEN_PURPOSE_SCOPES[purpose].length === scopes.length &&
      TOKEN_PURPOSE_SCOPES[purpose].every((scope) => scopes.includes(scope)),
  );
  return matching ?? 'custom';
}

/** 用途が選ぶscope。`custom`は今選ばれているものを保つ。 */
export function scopesForPurpose(
  purpose: TokenPurposeOption,
  currentScopes: readonly TokenScope[],
): TokenScope[] {
  return purpose === 'custom' ? [...currentScopes] : [...TOKEN_PURPOSE_SCOPES[purpose]];
}

/**
 * ダイアログの最初の用途。tokenの多くはSDKから記録するために発行され、`read`だけのtokenでは
 * そこで403になるので、ロールが許す限り記録を最初の用途にする。AdminのService Accountは、
 * たいていworkerを動かすためのもの。
 */
function defaultTokenPurpose(
  owner: TokenOwnerKind,
  purposes: readonly TokenPurposeOption[],
): TokenPurposeOption {
  if (owner.isServiceAccount && owner.role === 'admin' && purposes.includes('worker'))
    return 'worker';
  if (purposes.includes('recording')) return 'recording';
  return purposes.includes('readOnly') ? 'readOnly' : 'custom';
}

/**
 * ダイアログの最初の状態。ガイドが求めたscope（持ち主のロールを超えるものは、APIが拒否するので
 * 除く）か、既定の用途のscope。
 */
export function initialTokenScopeChoice({
  owner,
  initialScopes,
}: {
  owner: TokenOwnerKind;
  initialScopes?: readonly TokenScope[];
}): TokenScopeChoice {
  const purposes = purposesForOwner(owner);
  if (initialScopes) {
    const allowed = scopesAllowedForRole(owner.role);
    const scopes = initialScopes.filter((scope) => allowed.includes(scope));
    return { purpose: purposeForScopes(scopes, purposes), scopes };
  }
  const purpose = defaultTokenPurpose(owner, purposes);
  return { purpose, scopes: scopesForPurpose(purpose, []) };
}
