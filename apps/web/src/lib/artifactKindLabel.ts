// カタログの「種類」の列を、メディアタイプのままでなく言葉で出す（音声 · wav）。
import { text } from '../i18n/catalog';

const TOP_LEVEL_LABELS: Record<string, string> = {
  get audio() { return text.artifactMimeAudio; },
  get image() { return text.artifactMimeImage; },
  get video() { return text.artifactMimeVideo; },
  get text() { return text.artifactMimeText; },
};

/** `audio/wav; codecs=1` → `音声 · wav`。専用の言葉が無いタイプはサブタイプのまま。 */
export function artifactKindLabel(mimeType: string): string {
  const [essence = ''] = mimeType.split(';');
  const [topLevel = '', subtype = ''] = essence.trim().toLowerCase().split('/');
  const word = TOP_LEVEL_LABELS[topLevel];
  const shortSubtype = subtype.replace(/^x-/, '');
  return word ? `${word} · ${shortSubtype}` : shortSubtype || essence;
}
