import { memoizePerIntlLocale } from './intlFormatterCache';
import { getLocale, type Locale } from './locale';

/*
 * 画面が組み立てる文言のつなぎ方を表示言語に合わせる。並べた名前、横に並べた短いラベル、
 * 1つの段落にした文、括弧の注記。日本語は日本語の句読点と括弧（、・（）。文の間に空白を
 * 入れない）を使い、英語はカンマ、空白、半角の括弧を使う。単数・複数のある件数は
 * formatEnglishCount、英語の文言で引用符に囲んだ名前はformatEnglishQuotedListにある。
 */

/** 表示言語（または`intlLocale`）の列挙の形式。「A、B、C」か“A, B, and C”。 */
export const getListFormat = memoizePerIntlLocale(
  (intlLocale) => new Intl.ListFormat(intlLocale, { style: 'long', type: 'conjunction' }),
);

/** 名前を表示言語の文の中の列挙の形で並べる。「A、B、C」か“A, B, and C”。 */
export function formatList(items: readonly string[]): string {
  return getListFormat().format(items);
}

// 横に並べる短いラベルの区切り（文ではなく、タグの並び）。
const LABEL_SEPARATORS: Readonly<Record<Locale, string>> = { ja: '・', en: ' · ' };

/** 短いラベルをまとめて1つのラベルとして出す。「A・B」か“A · B”。 */
export function joinLabels(labels: readonly string[]): string {
  return labels.join(LABEL_SEPARATORS[getLocale()]);
}

// 日本語の文は「。」のすぐ後に次の文が続き、英語の文は空白で区切る。
const SENTENCE_SEPARATORS: Readonly<Record<Locale, string>> = { ja: '', en: ' ' };

/** 文を1つの段落にまとめる。どの文も自分の句読点で終わっている。空の文は除く。 */
export function joinSentences(sentences: readonly string[]): string {
  return sentences.filter((sentence) => sentence !== '').join(SENTENCE_SEPARATORS[getLocale()]);
}

/**
 * 説明する対象のすぐ後に置く括弧の注記。「（現在: 0）」か“ (current: 0)”。英語では開き括弧の
 * 前に空白を入れる。
 */
export function formatNote(note: string): string {
  return getLocale() === 'ja' ? `（${note}）` : ` (${note})`;
}
