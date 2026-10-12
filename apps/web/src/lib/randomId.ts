// 16 random bytes keep ids apart without crypto.randomUUID, which plain-http origins lack.
const RANDOM_ID_BYTES = 16;
const HEX_RADIX = 16;
const HEX_DIGITS_PER_BYTE = 2;

/**
 * A random id that also works on a plain-http origin: an idempotency key for one intended start
 * (a resend with the same key returns the first start), or the id of a new report block.
 */
export function createRandomId(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(RANDOM_ID_BYTES)), (byte) =>
    byte.toString(HEX_RADIX).padStart(HEX_DIGITS_PER_BYTE, '0'),
  ).join('');
}
