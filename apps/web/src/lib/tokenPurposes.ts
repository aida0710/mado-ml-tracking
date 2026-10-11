import {
  TOKEN_PURPOSE_SCOPES,
  TOKEN_PURPOSES,
  type ProjectRole,
  type TokenPurpose,
  type TokenScope,
} from '@mmt/contracts';
import { scopesAllowedForRole } from './tokenScopes';

/**
 * A choice of 用途 in the token dialog: a purpose (the scopes that use needs, from contracts), or
 * `custom`, choosing the scopes one by one.
 */
export type TokenPurposeOption = TokenPurpose | 'custom';

// The order the dialog lists them in: the purposes in their order, the free choice last.
const TOKEN_PURPOSE_OPTION_ORDER: readonly TokenPurposeOption[] = [...TOKEN_PURPOSES, 'custom'];

/** The purpose chosen in the token dialog and the scopes it stands for. */
export interface TokenScopeChoice {
  purpose: TokenPurposeOption;
  scopes: TokenScope[];
}

/** Who receives the token: the signed-in person, or a Service Account of the Project. */
export interface TokenOwnerKind {
  role: ProjectRole;
  isServiceAccount: boolean;
}

/**
 * The purposes this owner can be issued a token for: those whose every scope the owner's role
 * allows. A worker runs unattended, so it gets a Service Account's token rather than a person's,
 * which stops when that person leaves the Project.
 */
export function purposesForOwner(owner: TokenOwnerKind): TokenPurposeOption[] {
  const allowed = scopesAllowedForRole(owner.role);
  return TOKEN_PURPOSE_OPTION_ORDER.filter((purpose) => {
    if (purpose === 'custom') return true;
    if (purpose === 'worker' && !owner.isServiceAccount) return false;
    return TOKEN_PURPOSE_SCOPES[purpose].every((scope) => allowed.includes(scope));
  });
}

/** The purpose whose scopes are exactly `scopes` (in any order), or `custom`. */
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

/** The scopes a purpose selects; `custom` keeps what is selected now. */
export function scopesForPurpose(
  purpose: TokenPurposeOption,
  currentScopes: readonly TokenScope[],
): TokenScope[] {
  return purpose === 'custom' ? [...currentScopes] : [...TOKEN_PURPOSE_SCOPES[purpose]];
}

/**
 * The purpose the dialog starts with. Most tokens are issued to record from the SDKs, and a token
 * with `read` alone fails there with 403, so recording comes first whenever the role allows it;
 * an Admin Service Account usually runs a worker.
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
 * What the dialog starts with: the scopes a guide asked for (those above the owner's role left
 * out, as the API would refuse them), or the default purpose's.
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
