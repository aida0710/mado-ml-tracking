import { DomainError } from './errors.js';

// Environment settings express the default lifetime in days; timestamps use milliseconds.
const DAY_MILLISECONDS = 24 * 60 * 60 * 1000;

/** Explicit null never expires; omission preserves the configured default lifetime. */
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
    throw new DomainError(422, 'Tokenの期限は未来の日時を指定してください', 'invalid_expiry');
  return expiresAt;
}
