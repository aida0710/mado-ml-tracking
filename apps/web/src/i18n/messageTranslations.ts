import { getLocale } from './locale';

type MessagePair = { ja: string; en: string };
const messages = new Map<string, MessagePair>();

/** Notices may retain a translated string in state while the user changes language. */
export function registerMessage(japanese: string, english: string): void {
  const pair = { ja: japanese, en: english };
  messages.set(japanese, pair);
  messages.set(english, pair);
}

export function localizeMessage(message: string): string {
  return messages.get(message)?.[getLocale()] ?? message;
}
