// The catalog's 種類 column in words (音声 · wav) rather than the bare media type.
import { text } from '../i18n/catalog';

const TOP_LEVEL_LABELS: Record<string, string> = {
  get audio() { return text.artifactMimeAudio; },
  get image() { return text.artifactMimeImage; },
  get video() { return text.artifactMimeVideo; },
  get text() { return text.artifactMimeText; },
};

/** `audio/wav; codecs=1` → `音声 · wav`; types without a word of their own keep the subtype. */
export function artifactKindLabel(mimeType: string): string {
  const [essence = ''] = mimeType.split(';');
  const [topLevel = '', subtype = ''] = essence.trim().toLowerCase().split('/');
  const word = TOP_LEVEL_LABELS[topLevel];
  const shortSubtype = subtype.replace(/^x-/, '');
  return word ? `${word} · ${shortSubtype}` : shortSubtype || essence;
}
