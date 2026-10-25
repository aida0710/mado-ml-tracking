// Artifactのビューアで使う純粋な音声解析。波形のピークと、STFTのスペクトログラム（線形かmel）。
// workers/audioAnalysis.worker.tsの中と単体テストで動くので、DOMに触れてはいけない。

import { BROWSER_AUDIO_ANALYSIS_MAX_BYTES } from '@mmt/contracts';

/**
 * ビューアはファイル全体を取得し、Float32のPCMにデコードする。デコードしたPCMは圧縮時の数倍の
 * 大きさになり（64MiBのMP3は48kHzのステレオで1GiBを超えることがある）、ブラウザのタブは
 * たいてい2〜4GiBあたりで落とされるので、この大きさを超えるファイルは解析せずに再生する。
 * サーバーは同じ大きさを超えるものにプレビューを作る。
 */
export const AUDIO_ANALYSIS_MAX_BYTES = BROWSER_AUDIO_ANALYSIS_MAX_BYTES;
export const STFT_FFT_SIZE = 1024;
// ホップの最小値。長い範囲ではホップを大きくして、フレーム数を描画の幅の近くに保つ。
export const STFT_HOP_SIZE = 256;
// スペクトログラムの列が、幅の広いcanvasのピクセル数より多く要ることはない。
export const SPECTROGRAM_MAX_FRAMES = 2048;
// これより静かなビンはこの値まで引き上げ、無音を-Infinityでなく最も暗い色で描く。
export const SPECTROGRAM_DB_FLOOR = -100;
export const MEL_BAND_COUNT = 80;

export type SpectrogramScale = 'linear' | 'mel';
/** 'mix'は全チャンネルの平均。数値は1つのチャンネルを選ぶ（0始まり）。 */
export type AudioChannelSelection = 'mix' | number;

export interface WaveformPeaks {
  min: Float32Array;
  max: Float32Array;
}

export interface Spectrogram {
  frameCount: number;
  binCount: number;
  hopSize: number;
  /** 行優先のフレーム。values[frame * binCount + bin]で、値はSPECTROGRAM_DB_FLOORから0までのdB。 */
  values: Float32Array;
  /** 最後のビンが表す最高の周波数（ナイキスト周波数）。 */
  maxFrequency: number;
}

export function canAnalyzeAudio(sizeBytes: number): boolean {
  return sizeBytes <= AUDIO_ANALYSIS_MAX_BYTES;
}

export function selectChannelSamples(
  channels: readonly Float32Array[],
  selection: AudioChannelSelection,
): Float32Array {
  if (selection !== 'mix') {
    const channel = channels[selection];
    if (!channel) throw new RangeError(`Channel ${selection} does not exist`);
    return channel;
  }
  const first = channels[0];
  if (!first) return new Float32Array(0);
  if (channels.length === 1) return first;
  const mixed = new Float32Array(first.length);
  for (const channel of channels)
    for (let index = 0; index < mixed.length; index += 1) mixed[index]! += channel[index] ?? 0;
  for (let index = 0; index < mixed.length; index += 1) mixed[index]! /= channels.length;
  return mixed;
}

/** `bucketCount`個に等分した区間それぞれの、サンプルの最小値と最大値。空の区間は0とする。 */
export function computeWaveformPeaks(samples: Float32Array, bucketCount: number): WaveformPeaks {
  const count = Math.max(0, Math.floor(bucketCount));
  const min = new Float32Array(count);
  const max = new Float32Array(count);
  if (samples.length === 0) return { min, max };
  for (let bucket = 0; bucket < count; bucket += 1) {
    const start = Math.floor((bucket * samples.length) / count);
    const end = Math.max(start + 1, Math.floor(((bucket + 1) * samples.length) / count));
    let low = Infinity;
    let high = -Infinity;
    for (let index = start; index < end && index < samples.length; index += 1) {
      const value = samples[index]!;
      if (value < low) low = value;
      if (value > high) high = value;
    }
    min[bucket] = Number.isFinite(low) ? low : 0;
    max[bucket] = Number.isFinite(high) ? high : 0;
  }
  return { min, max };
}

export function createHannWindow(size: number): Float32Array {
  const window = new Float32Array(size);
  for (let index = 0; index < size; index += 1)
    window[index] = 0.5 - 0.5 * Math.cos((2 * Math.PI * index) / size);
  return window;
}

/** 配列をその場で書き換える反復型のradix-2 FFT。`real.length`は2のべき乗でなければならない。 */
export function fftInPlace(real: Float32Array, imaginary: Float32Array): void {
  const size = real.length;
  if ((size & (size - 1)) !== 0) throw new RangeError('FFT size must be a power of two');
  for (let index = 1, reversed = 0; index < size; index += 1) {
    let bit = size >> 1;
    for (; reversed & bit; bit >>= 1) reversed ^= bit;
    reversed ^= bit;
    if (index < reversed) {
      [real[index], real[reversed]] = [real[reversed]!, real[index]!];
      [imaginary[index], imaginary[reversed]] = [imaginary[reversed]!, imaginary[index]!];
    }
  }
  for (let length = 2; length <= size; length <<= 1) {
    const angle = (-2 * Math.PI) / length;
    const stepReal = Math.cos(angle);
    const stepImaginary = Math.sin(angle);
    for (let start = 0; start < size; start += length) {
      let twiddleReal = 1;
      let twiddleImaginary = 0;
      for (let offset = 0; offset < length / 2; offset += 1) {
        const even = start + offset;
        const odd = even + length / 2;
        const oddReal = real[odd]! * twiddleReal - imaginary[odd]! * twiddleImaginary;
        const oddImaginary = real[odd]! * twiddleImaginary + imaginary[odd]! * twiddleReal;
        real[odd] = real[even]! - oddReal;
        imaginary[odd] = imaginary[even]! - oddImaginary;
        real[even] = real[even]! + oddReal;
        imaginary[even] = imaginary[even]! + oddImaginary;
        const nextReal = twiddleReal * stepReal - twiddleImaginary * stepImaginary;
        twiddleImaginary = twiddleReal * stepImaginary + twiddleImaginary * stepReal;
        twiddleReal = nextReal;
      }
    }
  }
}

/** パワー比をdBに変え、`floorDb`を下限にする。基準を1とするので、フルスケールが0dBになる。 */
export function powerToDecibels(power: number, floorDb = SPECTROGRAM_DB_FLOOR): number {
  if (!(power > 0)) return floorDb;
  return Math.max(floorDb, Math.min(0, 10 * Math.log10(power)));
}

const hertzToMel = (hertz: number) => 2595 * Math.log10(1 + hertz / 700);
const melToHertz = (mel: number) => 700 * (10 ** (mel / 2595) - 1);

/** `fftSize / 2 + 1`個の線形のビンにかける、三角形のHTKのmelフィルタ。filters[band][bin]。 */
export function createMelFilterBank(
  sampleRate: number,
  fftSize: number,
  bandCount: number,
): Float32Array[] {
  const binCount = fftSize / 2 + 1;
  const maxMel = hertzToMel(sampleRate / 2);
  const edges = Array.from({ length: bandCount + 2 }, (_, index) =>
    melToHertz((maxMel * index) / (bandCount + 1)),
  );
  const binFrequency = (bin: number) => (bin * sampleRate) / fftSize;
  return Array.from({ length: bandCount }, (_, band) => {
    const [low, center, high] = [edges[band]!, edges[band + 1]!, edges[band + 2]!];
    const filter = new Float32Array(binCount);
    for (let bin = 0; bin < binCount; bin += 1) {
      const frequency = binFrequency(bin);
      if (frequency > low && frequency < high)
        filter[bin] =
          frequency <= center ? (frequency - low) / (center - low) : (high - frequency) / (high - center);
    }
    return filter;
  });
}

export interface SpectrogramOptions {
  sampleRate: number;
  scale?: SpectrogramScale;
  fftSize?: number;
  hopSize?: number;
  maxFrames?: number;
  melBandCount?: number;
}

/**
 * Hann窓をかけたSTFTのパワースペクトログラム（dB）。パワーを窓のコヒーレントゲインで正規化する
 * ので、フルスケールの正弦波は約0dBになる。範囲から`maxFrames`を超えるフレームができるときは
 * ホップを広げ、フレームが範囲全体に均等に並ぶようにする。
 */
export function computeSpectrogram(samples: Float32Array, options: SpectrogramOptions): Spectrogram {
  const fftSize = options.fftSize ?? STFT_FFT_SIZE;
  const maxFrames = options.maxFrames ?? SPECTROGRAM_MAX_FRAMES;
  const scale = options.scale ?? 'linear';
  const linearBinCount = fftSize / 2 + 1;
  const minimumHop = options.hopSize ?? STFT_HOP_SIZE;
  const naturalFrames = Math.max(0, Math.floor((samples.length - fftSize) / minimumHop) + 1);
  const frameCount = Math.min(naturalFrames, maxFrames);
  const hopSize =
    naturalFrames > maxFrames && frameCount > 1
      ? Math.floor((samples.length - fftSize) / (frameCount - 1))
      : minimumHop;
  const window = createHannWindow(fftSize);
  const windowSum = window.reduce((sum, value) => sum + value, 0);
  // フルスケールの正弦波の|X|^2は(windowSum / 2)^2なので、これで割るとパワー比が1になる。
  const powerReference = (windowSum / 2) ** 2;
  const melFilters =
    scale === 'mel'
      ? createMelFilterBank(options.sampleRate, fftSize, options.melBandCount ?? MEL_BAND_COUNT)
      : null;
  const binCount = melFilters ? melFilters.length : linearBinCount;
  const values = new Float32Array(frameCount * binCount);
  const real = new Float32Array(fftSize);
  const imaginary = new Float32Array(fftSize);
  const power = new Float32Array(linearBinCount);
  for (let frame = 0; frame < frameCount; frame += 1) {
    const offset = frame * hopSize;
    for (let index = 0; index < fftSize; index += 1) {
      real[index] = (samples[offset + index] ?? 0) * window[index]!;
      imaginary[index] = 0;
    }
    fftInPlace(real, imaginary);
    for (let bin = 0; bin < linearBinCount; bin += 1)
      power[bin] = (real[bin]! ** 2 + imaginary[bin]! ** 2) / powerReference;
    for (let bin = 0; bin < binCount; bin += 1) {
      const filter = melFilters?.[bin];
      let bandPower = 0;
      if (filter) for (let linear = 0; linear < linearBinCount; linear += 1) bandPower += filter[linear]! * power[linear]!;
      else bandPower = power[bin]!;
      values[frame * binCount + bin] = powerToDecibels(bandPower);
    }
  }
  return { frameCount, binCount, hopSize, values, maxFrequency: options.sampleRate / 2 };
}

/** 秒で表した時間の範囲を、範囲内に収めたサンプルの添字[start, end)に変える。 */
export function secondsToSampleRange(
  range: { startSeconds: number; endSeconds: number },
  sampleRate: number,
  sampleCount: number,
): { start: number; end: number } {
  const clamp = (value: number) => Math.min(sampleCount, Math.max(0, Math.round(value * sampleRate)));
  const start = clamp(range.startSeconds);
  return { start, end: Math.max(start, clamp(range.endSeconds)) };
}
