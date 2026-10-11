import { createHash, randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { computeSha256Hex } from './sha256';

const MIB = 1024 * 1024;
const nodeSha256 = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');

describe('computeSha256Hex', () => {
  it('FIPS 180-4 の例と同じ値になる', () => {
    expect(computeSha256Hex(new Uint8Array())).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    expect(computeSha256Hex(new TextEncoder().encode('abc'))).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
    expect(computeSha256Hex(new TextEncoder().encode('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq'))).toBe(
      '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1',
    );
  });

  it('末尾の詰め物が1ブロックに収まる長さでも2ブロックになる長さでも、Node の SHA-256 と一致する', () => {
    for (const length of [1, 55, 56, 57, 63, 64, 65, 119, 120, 127, 128, 1000]) {
      const bytes = randomBytes(length);
      expect(computeSha256Hex(bytes), `${length} bytes`).toBe(nodeSha256(bytes));
    }
  });

  it('大きな配列の途中を切り出した view でも、その範囲だけの値になる', () => {
    const whole = randomBytes(2 * MIB + 3);
    const slice = whole.subarray(MIB - 7, 2 * MIB);
    expect(computeSha256Hex(slice)).toBe(nodeSha256(slice));
  });
});
