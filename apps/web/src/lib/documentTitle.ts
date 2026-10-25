import { text } from '../i18n/catalog';

// ブラウザのタブのタイトルの区切り。"Runs · 音声モデル実験 · mado ML Tracking"のように使う。
const DOCUMENT_TITLE_SEPARATOR = ' · ';

/** 製品名。表示言語に従うよう、タイトルを設定するたびに読む。 */
export const getProductName = () => `${text.appNamePrefix} ${text.appNameProduct}`;

/**
 * ブラウザのタブのタイトル。タブ、履歴、ブックマークで画面を見分けられるよう、画面の名前を先にし、
 * 次に文脈（Projectか全体設定）、最後に製品名を置く。空の部分は除く。
 */
export function composeDocumentTitle(parts: readonly (string | null | undefined)[]): string {
  const named = parts.map((part) => part?.replace(/\s+/g, ' ').trim()).filter(Boolean);
  return [...named, getProductName()].join(DOCUMENT_TITLE_SEPARATOR);
}
