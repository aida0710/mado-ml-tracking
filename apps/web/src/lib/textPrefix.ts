// The leading part of a UTF-8 text cut at a byte limit without breaking a character, for previews
// that show only the head of a large file.

/**
 * The text of the first bytes of a UTF-8 file. A character cut by the end of the bytes is left
 * out rather than shown as a replacement character; a byte order mark is dropped.
 */
export function decodeUtf8Prefix(bytes: Uint8Array): string {
  // In streaming mode the decoder holds back an incomplete trailing sequence instead of emitting U+FFFD.
  return new TextDecoder('utf-8').decode(bytes, { stream: true });
}

/** The longest leading part of `text` whose UTF-8 encoding fits in `maxBytes`, whole characters only. */
export function leadingTextWithinBytes(text: string, maxBytes: number): string {
  const { read } = new TextEncoder().encodeInto(text, new Uint8Array(maxBytes));
  return text.slice(0, read);
}
