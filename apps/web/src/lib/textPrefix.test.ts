import { describe, expect, it } from 'vitest';
import { decodeUtf8Prefix, leadingTextWithinBytes } from './textPrefix';

describe('大きなテキストの先頭', () => {
  it('バイトの上限で切れた文字は置換文字にせず、手前の文字までを返す', () => {
    const bytes = new TextEncoder().encode('ログ');
    // 「グ」は3バイト。最後の1バイトを落とすと、文字の途中で切れる。
    expect(decodeUtf8Prefix(bytes.subarray(0, bytes.length - 1))).toBe('ロ');
    expect(decodeUtf8Prefix(bytes)).toBe('ログ');
  });

  it('先頭のBOMは表示しない', () => {
    expect(decodeUtf8Prefix(new Uint8Array([0xef, 0xbb, 0xbf, 0x61]))).toBe('a');
  });

  it('読み込み済みの文字列も、UTF-8で上限のバイト数に収まる文字までに切る', () => {
    expect(leadingTextWithinBytes('abcログ', 5)).toBe('abc');
    expect(leadingTextWithinBytes('abcログ', 6)).toBe('abcロ');
    expect(leadingTextWithinBytes('abc', 1024)).toBe('abc');
  });
});
