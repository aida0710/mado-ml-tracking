import { getLocale } from './locale';

type MessagePair = { ja: string; en: string };
const messages = new Map<string, MessagePair>();

/** 通知は、利用者が表示言語を切り替える間も、訳した文字列をstateに持ったままのことがある。 */
export function registerMessage(japanese: string, english: string): void {
  const pair = { ja: japanese, en: english };
  messages.set(japanese, pair);
  messages.set(english, pair);
}

export function localizeMessage(message: string): string {
  return messages.get(message)?.[getLocale()] ?? message;
}
