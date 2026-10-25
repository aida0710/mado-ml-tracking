import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { readAudioSampleRate } from './audioSampleRate';

// ffmpegで生成した。コマンドはapps/web/tests/browser-artifacts.mjsを参照。
const fixture = (name: string) => {
  const bytes = readFileSync(new URL(`../../tests/fixtures/audio/${name}`, import.meta.url));
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
};

describe('音声ファイルのサンプルレート', () => {
  it('WAV・FLAC・MP3のヘッダから保存時のサンプルレートを読む', () => {
    expect(readAudioSampleRate(fixture('mono-16k.wav'))).toBe(16000);
    expect(readAudioSampleRate(fixture('stereo-48k.flac'))).toBe(48000);
    expect(readAudioSampleRate(fixture('tone-22k.mp3'))).toBe(22050);
  });

  it('読めない形式はnullを返し、推測で値を作らない', () => {
    expect(readAudioSampleRate(new TextEncoder().encode('not audio at all').buffer)).toBeNull();
    expect(readAudioSampleRate(new ArrayBuffer(0))).toBeNull();
  });
});
