// Keep the familiar presets and default while allowing shorter, longer and unlimited lifetimes.
export const TOKEN_EXPIRY_PRESET_DAYS = [7, 30, 90, 365] as const;
export type TokenExpiryOption = `${typeof TOKEN_EXPIRY_PRESET_DAYS[number]}` | 'never' | 'custom';
export type TokenExpiryUnit = 'minutes' | 'hours' | 'days';
export interface TokenExpirySelection {
  option: TokenExpiryOption;
  duration: string;
  unit: TokenExpiryUnit;
}
export const DEFAULT_TOKEN_EXPIRY_SELECTION: TokenExpirySelection = {
  option: '90', duration: '90', unit: 'days',
};

// Durations are entered in their selected unit; the API receives an absolute timestamp.
const UNIT_MILLISECONDS: Record<TokenExpiryUnit, number> = {
  minutes: 60 * 1000,
  hours: 60 * 60 * 1000,
  days: 24 * 60 * 60 * 1000,
};

/** null means unlimited; undefined means the duration cannot produce a future timestamp. */
export function resolveTokenExpiryTimestamp(
  selection: TokenExpirySelection,
  now = Date.now(),
): string | null | undefined {
  if (selection.option === 'never') return null;
  const duration = Number(selection.option === 'custom' ? selection.duration : selection.option);
  const unit = selection.option === 'custom' ? selection.unit : 'days';
  if (!Number.isFinite(duration) || duration <= 0) return undefined;
  const expiresAt = new Date(now + duration * UNIT_MILLISECONDS[unit]);
  if (!Number.isFinite(expiresAt.getTime()) || expiresAt.getTime() <= now) return undefined;
  return expiresAt.toISOString();
}
