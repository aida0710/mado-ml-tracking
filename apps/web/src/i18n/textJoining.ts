import { getIntlLocale, getLocale, INTL_LOCALES, type Locale } from './locale';

/*
 * How the display language joins pieces of text that the screens put together: names in a list,
 * short labels side by side, sentences in one paragraph and a note in parentheses.
 * Japanese keeps its own punctuation (、・（）, no space between sentences); English uses commas,
 * spaces and half-width parentheses. Counts with singular and plural are in formatEnglishCount.
 */

const listFormats = new Map<string, Intl.ListFormat>();

function getListFormat(intlLocale: string): Intl.ListFormat {
  const cached = listFormats.get(intlLocale);
  if (cached) return cached;
  const listFormat = new Intl.ListFormat(intlLocale, { style: 'long', type: 'conjunction' });
  listFormats.set(intlLocale, listFormat);
  return listFormat;
}

/** Names listed as a sentence of the display language lists them: 「A、B、C」 or “A, B, and C”. */
export function formatList(items: readonly string[]): string {
  return getListFormat(getIntlLocale()).format(items);
}

/**
 * Names quoted the way English messages quote them, listed as a sentence lists them: “a”, “b”, and
 * “c”. For the English catalogs, which build English text whatever the caller's language.
 */
export function formatEnglishQuotedList(names: readonly string[]): string {
  return getListFormat(INTL_LOCALES.en).format(names.map((name) => `“${name}”`));
}

// The separators of short labels shown side by side (a tag list, not a sentence).
const LABEL_SEPARATORS: Readonly<Record<Locale, string>> = { ja: '・', en: ' · ' };

/** Short labels shown together as one label: 「A・B」 or “A · B”. */
export function joinLabels(labels: readonly string[]): string {
  return labels.join(LABEL_SEPARATORS[getLocale()]);
}

// Japanese sentences follow each other directly after 「。」; English ones are separated by a space.
const SENTENCE_SEPARATORS: Readonly<Record<Locale, string>> = { ja: '', en: ' ' };

/** Sentences shown as one paragraph. Each sentence ends with its own punctuation; empty ones are left out. */
export function joinSentences(sentences: readonly string[]): string {
  return sentences.filter((sentence) => sentence !== '').join(SENTENCE_SEPARATORS[getLocale()]);
}

/**
 * A note in parentheses, put right after what it explains: 「（現在: 0）」 or “ (current: 0)”, with
 * the space English puts before an opening parenthesis.
 */
export function formatNote(note: string): string {
  return getLocale() === 'ja' ? `（${note}）` : ` (${note})`;
}
