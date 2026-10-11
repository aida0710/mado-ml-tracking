import type { TokenSummary } from '@mmt/contracts';

/**
 * Project tokens that still work now (the list holds unrevoked ones, expired included): the
 * workers, Service Accounts and scripts that stop answering once the Project is archived.
 */
export function countUsableTokens(tokens: readonly TokenSummary[], now: number): number {
  return tokens.filter((token) => token.expiresAt === null || Date.parse(token.expiresAt) > now)
    .length;
}
