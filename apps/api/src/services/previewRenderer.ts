import type { WaveformPeaksPreview } from '@mmt/contracts';
import { SpectrogramAccumulator } from '../domain/spectrogramAccumulator.js';
import { renderSpectrogramPng } from '../domain/spectrogramImage.js';
import { WaveformPeaksAccumulator } from '../domain/waveformPeaksAccumulator.js';
import { MediaToolFailedError, runMediaTool } from './mediaTools.js';

const FLOAT32_BYTES = 4;
// 詳細の表示には十分な幅。これより大きいフレームはポスター画像の読み込みを遅くするだけ。
const POSTER_MAX_WIDTH = 1280;
// 冒頭の黒いフレームを飛ばしつつ、短い動画の終わりを越えてシークしないようにする。
const POSTER_SEEK_SECONDS = 1;
const POSTER_SEEK_FRACTION = 0.1;
// 幅1280のフレームのPNGは、大きくても数MiB。
const POSTER_MAX_BYTES = 32 * 1024 * 1024;

export interface MediaToolPaths {
  ffmpegPath: string;
  timeoutMs: number;
}

export interface AudioPreviews {
  peaks: WaveformPeaksPreview;
  spectrogramPng: Buffer;
}

/** バイト列のストリームをFloat32のサンプルに分ける。半端なサンプルは次のチャンクへ持ち越す。 */
function float32Reader(onSamples: (samples: Float32Array) => void): (chunk: Buffer) => void {
  let carry = Buffer.alloc(0);
  return (chunk) => {
    const bytes = carry.length > 0 ? Buffer.concat([carry, chunk]) : chunk;
    const usable = bytes.length - (bytes.length % FLOAT32_BYTES);
    carry = Buffer.from(bytes.subarray(usable));
    // コピーし、チャンクがプールの中のどの位置にあってもFloat32Arrayがアラインされるようにする。
    const aligned = new Uint8Array(bytes.subarray(0, usable));
    onSamples(new Float32Array(aligned.buffer, 0, usable / FLOAT32_BYTES));
  };
}

/**
 * 最初の音声ストリームを、元のサンプルレートのままモノラルにミックスして1回だけデコードし、
 * ピークとスペクトログラムの両方へ流し込む。数GBのファイルでもメモリに載せずに済む。
 */
export async function renderAudioPreviews(render: {
  tools: MediaToolPaths;
  filePath: string;
  sampleRate: number;
}): Promise<AudioPreviews> {
  const peaks = new WaveformPeaksAccumulator();
  const spectrogram = new SpectrogramAccumulator();
  await runMediaTool({
    command: render.tools.ffmpegPath,
    args: [
      '-v', 'error', '-nostdin', '-i', render.filePath,
      '-map', '0:a:0', '-ac', '1', '-ar', String(render.sampleRate), '-f', 'f32le', 'pipe:1',
    ],
    timeoutMs: render.tools.timeoutMs,
    onStdout: float32Reader((samples) => {
      peaks.add(samples);
      spectrogram.add(samples);
    }),
  });
  const result = peaks.finish({ sampleRate: render.sampleRate });
  if (result.min.length === 0) throw new MediaToolFailedError('output');
  return { peaks: result, spectrogramPng: renderSpectrogramPng(spectrogram.finish()) };
}

export async function renderVideoPoster(render: {
  tools: MediaToolPaths;
  filePath: string;
  durationSeconds: number | null;
  width: number;
}): Promise<Buffer> {
  const seekSeconds = Math.min(
    POSTER_SEEK_SECONDS,
    (render.durationSeconds ?? 0) * POSTER_SEEK_FRACTION,
  );
  const poster = await runMediaTool({
    command: render.tools.ffmpegPath,
    args: [
      '-v', 'error', '-nostdin', '-ss', seekSeconds.toFixed(3), '-i', render.filePath,
      '-map', '0:v:0', '-frames:v', '1',
      ...(render.width > POSTER_MAX_WIDTH ? ['-vf', `scale=${POSTER_MAX_WIDTH}:-2`] : []),
      '-f', 'image2pipe', '-c:v', 'png', 'pipe:1',
    ],
    timeoutMs: render.tools.timeoutMs,
    maxOutputBytes: POSTER_MAX_BYTES,
  });
  if (poster.length === 0) throw new MediaToolFailedError('output');
  return poster;
}
