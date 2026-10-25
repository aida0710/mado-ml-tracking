// バイト数の上限で、文字を壊さずに切ったUTF-8のテキストの先頭部分。大きなファイルの先頭だけを
// 見せるプレビューで使う。

/**
 * UTF-8のファイルの先頭のバイト列のテキスト。バイト列の終わりで切れた文字は、置換文字として
 * 出さずに除く。BOMは取り除く。
 */
export function decodeUtf8Prefix(bytes: Uint8Array): string {
  // ストリーミングのモードでは、デコーダは末尾の不完全なバイト列をU+FFFDとして出さずに保留する。
  return new TextDecoder('utf-8').decode(bytes, { stream: true });
}

/** UTF-8にしたときに`maxBytes`に収まる、`text`の最も長い先頭部分（文字の単位で切る）。 */
export function leadingTextWithinBytes(text: string, maxBytes: number): string {
  const { read } = new TextEncoder().encodeInto(text, new Uint8Array(maxBytes));
  return text.slice(0, read);
}
