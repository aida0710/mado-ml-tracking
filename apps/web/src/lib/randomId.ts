// 16バイトの乱数でidを区別する。crypto.randomUUIDは素のhttpのオリジンでは使えない。
const RANDOM_ID_BYTES = 16;
const HEX_RADIX = 16;
const HEX_DIGITS_PER_BYTE = 2;

/**
 * 素のhttpのオリジンでも使える乱数のid。1回の起動の意図を表す冪等キー（同じキーで送り直すと
 * 最初の起動を返す）や、新しいレポートのブロックのidに使う。
 */
export function createRandomId(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(RANDOM_ID_BYTES)), (byte) =>
    byte.toString(HEX_RADIX).padStart(HEX_DIGITS_PER_BYTE, '0'),
  ).join('');
}
