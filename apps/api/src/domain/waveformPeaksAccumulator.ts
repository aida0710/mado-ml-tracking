import type { WaveformPeaksPreview } from '@mmt/contracts';

// canvasの幅よりはるかに多い。ビューアは取り直さずに全体表示から拡大できる。
export const WAVEFORM_PEAKS_MAX_COUNT = 8192;
// 小数4桁でJSONを小さく保つ。1ピクセルの列ではそれより細かい振幅の差は出せない。
const PEAK_DECIMALS = 4;

function roundPeak(value: number): number {
  return Number(value.toFixed(PEAK_DECIMALS));
}

function clampSample(value: number): number {
  return Math.max(-1, Math.min(1, value));
}

/**
 * モノラルのサンプルを、長さを前もって知らずにmin/maxのピークへ流し込む。各ピークは1サンプル
 * から始まり、数が`maxCount`に達すると隣どうしのピークをまとめ、ピークあたりのサンプル数を倍に
 * する。こうしてメモリは一定に保たれ、結果のピークの数はmaxCount/2からmaxCountの間になる
 * （ごく短い音声のときだけそれより少ない）。
 */
export class WaveformPeaksAccumulator {
  private readonly min: number[] = [];
  private readonly max: number[] = [];
  private samplesPerPeak = 1;
  private currentCount = 0;
  private currentMin = Infinity;
  private currentMax = -Infinity;
  private totalSamples = 0;

  constructor(private readonly maxCount = WAVEFORM_PEAKS_MAX_COUNT) {
    if (maxCount < 2 || maxCount % 2 !== 0) throw new RangeError('maxCount must be an even number ≥ 2');
  }

  add(samples: Float32Array): void {
    for (let index = 0; index < samples.length; index += 1) {
      const value = samples[index]!;
      if (value < this.currentMin) this.currentMin = value;
      if (value > this.currentMax) this.currentMax = value;
      this.currentCount += 1;
      if (this.currentCount === this.samplesPerPeak) this.closeCurrentPeak();
    }
    this.totalSamples += samples.length;
  }

  finish(audio: { sampleRate: number }): WaveformPeaksPreview {
    if (this.currentCount > 0) this.closeCurrentPeak();
    return {
      version: 1,
      sampleRate: audio.sampleRate,
      durationSeconds: this.totalSamples / audio.sampleRate,
      samplesPerPeak: this.samplesPerPeak,
      min: this.min.map(roundPeak),
      max: this.max.map(roundPeak),
    };
  }

  private closeCurrentPeak(): void {
    // NaNのサンプルは最大・最小を更新しない。そうした区間は無音として読む。
    this.min.push(Number.isFinite(this.currentMin) ? clampSample(this.currentMin) : 0);
    this.max.push(Number.isFinite(this.currentMax) ? clampSample(this.currentMax) : 0);
    this.currentCount = 0;
    this.currentMin = Infinity;
    this.currentMax = -Infinity;
    if (this.min.length === this.maxCount) this.halveResolution();
  }

  private halveResolution(): void {
    for (let peak = 0; peak < this.maxCount / 2; peak += 1) {
      this.min[peak] = Math.min(this.min[2 * peak]!, this.min[2 * peak + 1]!);
      this.max[peak] = Math.max(this.max[2 * peak]!, this.max[2 * peak + 1]!);
    }
    this.min.length = this.maxCount / 2;
    this.max.length = this.maxCount / 2;
    this.samplesPerPeak *= 2;
  }
}
