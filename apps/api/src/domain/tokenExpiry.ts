import { DomainError } from './errors.js';

// 環境変数の設定は既定の有効期間を日数で表す。時刻はミリ秒を使う。
const DAY_MILLISECONDS = 24 * 60 * 60 * 1000;

/** 明示的なnullは期限切れにならない。省略すると設定した既定の有効期間を使う。 */
export function resolveTokenExpiry(request: {
  expiresAt: string | null | undefined;
  defaultLifetimeDays: number;
  now: Date;
}): Date | null {
  if (request.expiresAt === null) return null;
  const expiresAt = request.expiresAt === undefined
    ? new Date(request.now.getTime() + request.defaultLifetimeDays * DAY_MILLISECONDS)
    : new Date(request.expiresAt);
  if (!Number.isFinite(expiresAt.getTime()) || expiresAt <= request.now)
    throw new DomainError({
      status: 422,
      code: 'invalid_expiry',
      message: 'the token expiry must be in the future',
    });
  return expiresAt;
}
