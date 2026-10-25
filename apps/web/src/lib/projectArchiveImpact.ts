import type { TokenSummary } from '@mmt/contracts';

/**
 * 今も使えるProjectのtoken（一覧には取り消していないものが入り、期限切れも含む）。Projectを
 * アーカイブすると応答しなくなるworker、Service Account、スクリプトにあたる。
 */
export function countUsableTokens(tokens: readonly TokenSummary[], now: number): number {
  return tokens.filter((token) => token.expiresAt === null || Date.parse(token.expiresAt) > now)
    .length;
}
