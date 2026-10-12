import { text } from '../i18n/catalog';

// Between the parts of a browser tab's title, as in "Runs · 音声モデル実験 · mado ML Tracking".
const DOCUMENT_TITLE_SEPARATOR = ' · ';

/** The product name, read each time a title is set so it follows the display language. */
export const getProductName = () => `${text.appNamePrefix} ${text.appNameProduct}`;

/**
 * The browser tab's title: the screen's own name first so tabs, history and bookmarks tell screens
 * apart, then its context (the Project, or 全体設定), then the product. Blank parts are left out.
 */
export function composeDocumentTitle(parts: readonly (string | null | undefined)[]): string {
  const named = parts.map((part) => part?.replace(/\s+/g, ' ').trim()).filter(Boolean);
  return [...named, getProductName()].join(DOCUMENT_TITLE_SEPARATOR);
}
