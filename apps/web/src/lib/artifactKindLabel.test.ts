import { describe, expect, it } from 'vitest';
import { artifactKindLabel } from './artifactKindLabel';

describe('artifactKindLabel', () => {
  it('音声・画像・動画・テキストは言葉と形式で、ほかは形式の名前で書く', () => {
    expect(artifactKindLabel('audio/wav')).toBe('音声 · wav');
    expect(artifactKindLabel('audio/x-flac')).toBe('音声 · flac');
    expect(artifactKindLabel('text/plain; charset=utf-8')).toBe('テキスト · plain');
    expect(artifactKindLabel('application/json')).toBe('json');
    expect(artifactKindLabel('application/octet-stream')).toBe('octet-stream');
  });
});
