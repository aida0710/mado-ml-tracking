// 画面のビューア（apps/web/src/lib/audioAnalysis.ts）と同じ窓と下限を使い、同じファイルなら
// サーバーの画像とブラウザで描いたスペクトログラムが同じに見えるようにする。
export const SPECTROGRAM_FFT_SIZE = 1024;
export const SPECTROGRAM_DB_FLOOR = -100;
// 広いcanvasの1ピクセルに1列。画像は描く幅に引き伸ばす。
export const SPECTROGRAM_MAX_COLUMNS = 2048;

export interface SpectrogramDecibels {
  columnCount: number;
  /** 0 Hzからナイキスト周波数までの線形のbin。数はfftSize / 2 + 1。 */
  binCount: number;
  /** 列優先: values[column * binCount + bin]。値はSPECTROGRAM_DB_FLOORから0の間。 */
  values: Float32Array;
}

function createHannWindow(size: number): Float64Array {
  const window = new Float64Array(size);
  for (let index = 0; index < size; index += 1)
    window[index] = 0.5 - 0.5 * Math.cos((2 * Math.PI * index) / (size - 1));
  return window;
}

interface TwiddleTable {
  cos: Float64Array;
  sin: Float64Array;
}

/** k < size/2での-2πk/sizeのcos/sin。FFTがbutterflyごとにMath.cosを呼ばずに済む。 */
function createTwiddleTable(size: number): TwiddleTable {
  const cos = new Float64Array(size / 2);
  const sin = new Float64Array(size / 2);
  for (let index = 0; index < size / 2; index += 1) {
    cos[index] = Math.cos((-2 * Math.PI * index) / size);
    sin[index] = Math.sin((-2 * Math.PI * index) / size);
  }
  return { cos, sin };
}

/**
 * in-placeで反復するradix-2のFFT。`real.length`は、テーブルを作ったときの2のべき乗で
 * なければならない。
 */
function fft(real: Float64Array, imaginary: Float64Array, twiddles: TwiddleTable): void {
  const size = real.length;
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
    const stride = size / length;
    for (let start = 0; start < size; start += length)
      for (let offset = 0; offset < length / 2; offset += 1) {
        const twiddleReal = twiddles.cos[offset * stride]!;
        const twiddleImaginary = twiddles.sin[offset * stride]!;
        const even = start + offset;
        const odd = even + length / 2;
        const oddReal = real[odd]! * twiddleReal - imaginary[odd]! * twiddleImaginary;
        const oddImaginary = real[odd]! * twiddleImaginary + imaginary[odd]! * twiddleReal;
        real[odd] = real[even]! - oddReal;
        imaginary[odd] = imaginary[even]! - oddImaginary;
        real[even] = real[even]! + oddReal;
        imaginary[even] = imaginary[even]! + oddImaginary;
      }
  }
}

/**
 * モノラルのサンプルを流し込み、音声を保持せずにファイル全体の平均パワーのスペクトログラムを
 * 作る。重ならないHannのフレームを列に足し合わせ、列の数が`maxColumns`に達したら、
 * WaveformPeaksAccumulatorと同じく隣どうしの列をまとめる。
 */
export class SpectrogramAccumulator {
  private readonly binCount: number;
  private readonly window: Float64Array;
  private readonly twiddles: TwiddleTable;
  private readonly powerReference: number;
  private readonly frame: Float64Array;
  private readonly real: Float64Array;
  private readonly imaginary: Float64Array;
  private readonly columnPower: Float64Array;
  private readonly columnFrames: Uint32Array;
  private frameFill = 0;
  private framesPerColumn = 1;
  private columnCount = 0;
  private framesInCurrentColumn = 0;
  private hasFrames = false;

  constructor(
    private readonly options: { fftSize?: number; maxColumns?: number } = {},
  ) {
    const fftSize = options.fftSize ?? SPECTROGRAM_FFT_SIZE;
    const maxColumns = options.maxColumns ?? SPECTROGRAM_MAX_COLUMNS;
    if (!Number.isInteger(Math.log2(fftSize))) throw new RangeError('fftSize must be a power of two');
    if (maxColumns < 2 || maxColumns % 2 !== 0) throw new RangeError('maxColumns must be an even number ≥ 2');
    this.binCount = fftSize / 2 + 1;
    this.window = createHannWindow(fftSize);
    this.twiddles = createTwiddleTable(fftSize);
    const windowSum = this.window.reduce((sum, value) => sum + value, 0);
    // フルスケールの正弦波の|X|^2は(windowSum / 2)^2なので、フルスケールがおよそ0 dBになる。
    this.powerReference = (windowSum / 2) ** 2;
    this.frame = new Float64Array(fftSize);
    this.real = new Float64Array(fftSize);
    this.imaginary = new Float64Array(fftSize);
    this.columnPower = new Float64Array(maxColumns * this.binCount);
    this.columnFrames = new Uint32Array(maxColumns);
  }

  private get maxColumns(): number {
    return this.columnFrames.length;
  }

  add(samples: Float32Array): void {
    for (let index = 0; index < samples.length; index += 1) {
      const value = samples[index]!;
      this.frame[this.frameFill] = Number.isFinite(value) ? value : 0;
      this.frameFill += 1;
      if (this.frameFill === this.frame.length) this.addFrame();
    }
  }

  finish(): SpectrogramDecibels {
    // 1フレームより短い音声でも、ゼロ埋めした列を1つ作る。それより長い音声の端数は捨てる。
    if (!this.hasFrames && this.frameFill > 0) {
      this.frame.fill(0, this.frameFill);
      this.addFrame();
    }
    const columnCount = this.columnCount + (this.framesInCurrentColumn > 0 ? 1 : 0);
    const values = new Float32Array(columnCount * this.binCount);
    for (let column = 0; column < columnCount; column += 1) {
      const frames = this.columnFrames[column]!;
      for (let bin = 0; bin < this.binCount; bin += 1) {
        const power = frames > 0 ? this.columnPower[column * this.binCount + bin]! / frames : 0;
        values[column * this.binCount + bin] =
          power > 0
            ? Math.max(SPECTROGRAM_DB_FLOOR, Math.min(0, 10 * Math.log10(power)))
            : SPECTROGRAM_DB_FLOOR;
      }
    }
    return { columnCount, binCount: this.binCount, values };
  }

  private addFrame(): void {
    this.frameFill = 0;
    this.hasFrames = true;
    for (let index = 0; index < this.frame.length; index += 1) {
      this.real[index] = this.frame[index]! * this.window[index]!;
      this.imaginary[index] = 0;
    }
    fft(this.real, this.imaginary, this.twiddles);
    const offset = this.columnCount * this.binCount;
    for (let bin = 0; bin < this.binCount; bin += 1)
      this.columnPower[offset + bin]! +=
        (this.real[bin]! ** 2 + this.imaginary[bin]! ** 2) / this.powerReference;
    this.columnFrames[this.columnCount]! += 1;
    this.framesInCurrentColumn += 1;
    if (this.framesInCurrentColumn < this.framesPerColumn) return;
    this.framesInCurrentColumn = 0;
    this.columnCount += 1;
    if (this.columnCount === this.maxColumns) this.halveResolution();
  }

  private halveResolution(): void {
    const half = this.maxColumns / 2;
    for (let column = 0; column < half; column += 1) {
      for (let bin = 0; bin < this.binCount; bin += 1)
        this.columnPower[column * this.binCount + bin] =
          this.columnPower[2 * column * this.binCount + bin]! +
          this.columnPower[(2 * column + 1) * this.binCount + bin]!;
      this.columnFrames[column] = this.columnFrames[2 * column]! + this.columnFrames[2 * column + 1]!;
    }
    this.columnPower.fill(0, half * this.binCount);
    this.columnFrames.fill(0, half);
    this.columnCount = half;
    this.framesPerColumn *= 2;
  }
}
