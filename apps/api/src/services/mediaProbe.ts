import { MediaToolFailedError, runMediaTool } from './mediaTools.js';

/** プレビューのworkerがffprobeから必要とする情報。ありえない範囲の値は入れない。 */
export interface MediaProbe {
  durationSeconds: number | null;
  audio: {
    codec: string;
    sampleRate: number;
    channels: number;
    bitsPerSample: number | null;
  } | null;
  video: { codec: string; width: number; height: number } | null;
}

// 壊れたコンテナから出たでたらめな値を、メディア情報として保存せずに範囲の上限で弾く。
const MAX_DURATION_SECONDS = 31 * 24 * 60 * 60;
// DSDのファイルは352.8 kHzにデコードされる。768 kHzは実際に使われるPCMの最高のレート。
const MAX_SAMPLE_RATE = 768_000;
// ambisonicsやマルチチャンネルのアレイに対する、ffmpeg自身のチャンネルレイアウトの上限。
const MAX_CHANNELS = 1024;
const MAX_BITS_PER_SAMPLE = 64;
// 16Kの動画は幅15360。それより大きければヘッダーが壊れている。
const MAX_VIDEO_DIMENSION = 16_384;
// ffprobeのcodec_nameの値は、pcm_s16le、mp3、opus、h264のような短い識別子。
const CODEC_NAME = /^[a-z0-9_.-]{1,32}$/;

type JsonObject = Record<string, unknown>;

function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** ffprobeはほとんどの数値を文字列で出す（"44100"、"12.345000"）。どちらの形も受け付ける。 */
function numberField(source: JsonObject, key: string): number | null {
  const value = source[key];
  const parsed = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  return Number.isFinite(parsed) ? parsed : null;
}

function integerInRange(source: JsonObject, key: string, max: number): number | null {
  const value = numberField(source, key);
  return value !== null && Number.isInteger(value) && value > 0 && value <= max ? value : null;
}

function durationField(source: JsonObject | undefined): number | null {
  if (!source) return null;
  const value = numberField(source, 'duration');
  return value !== null && value >= 0 && value <= MAX_DURATION_SECONDS ? value : null;
}

function codecField(stream: JsonObject): string | null {
  const value = stream.codec_name;
  return typeof value === 'string' && CODEC_NAME.test(value) ? value : null;
}

function parseAudioStream(stream: JsonObject): MediaProbe['audio'] {
  const codec = codecField(stream);
  const sampleRate = integerInRange(stream, 'sample_rate', MAX_SAMPLE_RATE);
  const channels = integerInRange(stream, 'channels', MAX_CHANNELS);
  if (!codec || !sampleRate || !channels) return null;
  // 非可逆のコーデックはここで0を返す。PCMはbits_per_sample、FLACはbits_per_raw_sampleを返す。
  const bitsPerSample =
    integerInRange(stream, 'bits_per_raw_sample', MAX_BITS_PER_SAMPLE) ??
    integerInRange(stream, 'bits_per_sample', MAX_BITS_PER_SAMPLE);
  return { codec, sampleRate, channels, bitsPerSample };
}

function parseVideoStream(stream: JsonObject): MediaProbe['video'] {
  const codec = codecField(stream);
  const width = integerInRange(stream, 'width', MAX_VIDEO_DIMENSION);
  const height = integerInRange(stream, 'height', MAX_VIDEO_DIMENSION);
  // MP3/M4Aのカバー画像は1フレームの"video"ストリームで、再生できる動画ではない。
  const disposition = isObject(stream.disposition) ? stream.disposition : {};
  if (!codec || !width || !height || disposition.attached_pic === 1) return null;
  return { codec, width, height };
}

/**
 * `ffprobe -print_format json -show_format -show_streams`の出力を検証する。出力がその形に
 * まったく合わなければnullを返す。個々のありえない値は捨てる。
 */
export function parseFfprobeOutput(output: string): MediaProbe | null {
  let document: unknown;
  try {
    document = JSON.parse(output);
  } catch {
    return null;
  }
  if (!isObject(document) || !Array.isArray(document.streams)) return null;
  const streams = document.streams.filter(isObject);
  const audioStream = streams.find((stream) => stream.codec_type === 'audio');
  const videoStream = streams.find((stream) => stream.codec_type === 'video');
  const audio = audioStream ? parseAudioStream(audioStream) : null;
  const video = videoStream ? parseVideoStream(videoStream) : null;
  const format = isObject(document.format) ? document.format : undefined;
  return {
    durationSeconds: durationField(format) ?? durationField(audioStream) ?? durationField(videoStream),
    audio,
    video,
  };
}

export async function probeMediaFile(probe: {
  ffprobePath: string;
  filePath: string;
  timeoutMs: number;
}): Promise<MediaProbe> {
  const output = await runMediaTool({
    command: probe.ffprobePath,
    args: ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', '--', probe.filePath],
    timeoutMs: probe.timeoutMs,
  });
  const parsed = parseFfprobeOutput(output.toString('utf8'));
  if (!parsed) throw new MediaToolFailedError('output');
  return parsed;
}
