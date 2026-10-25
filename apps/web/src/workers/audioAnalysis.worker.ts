// 波形のピークとスペクトログラムをメインスレッドの外で計算する。デコードはメインスレッドで行い
// （workerではWeb Audioのデコードを使えない）、PCMを1回だけここへ渡す。表示を変えるたびに送るのは
// 小さな要求だけなので、拡大やチャンネルの切り替えで音声をもう一度コピーすることはない。
import {
  computeSpectrogram,
  computeWaveformPeaks,
  secondsToSampleRange,
  selectChannelSamples,
  type AudioChannelSelection,
  type Spectrogram,
  type SpectrogramScale,
  type WaveformPeaks,
} from '../lib/audioAnalysis';
import type { TimeRange } from '../lib/audioTimeline';

export interface AudioAnalysisLoadMessage {
  type: 'load';
  channels: Float32Array[];
  sampleRate: number;
}
export interface AudioAnalysisView {
  channel: AudioChannelSelection;
  /** nullならファイル全体を解析する。 */
  range: TimeRange | null;
  /** 描く幅（デバイスピクセル）。ピークは1列につき1区間で求める。 */
  columns: number;
  scale: SpectrogramScale;
}
export interface AudioAnalysisRequestMessage extends AudioAnalysisView {
  type: 'analyze';
  requestId: number;
}
export type AudioAnalysisResponse =
  | { requestId: number; peaks: WaveformPeaks; spectrogram: Spectrogram }
  | { requestId: number; error: string };

// DOMのlibは`self`をWindowとして型付けする。このファイルに要るのはworker側のpostMessageだけ。
const workerScope = self as unknown as {
  onmessage: ((event: MessageEvent<AudioAnalysisLoadMessage | AudioAnalysisRequestMessage>) => void) | null;
  postMessage: (message: AudioAnalysisResponse, transfer: Transferable[]) => void;
};

let channels: Float32Array[] = [];
let sampleRate = 0;
// 長いステレオのファイルのミックスは全体を1回走査するので、結果を後の要求のために取っておく。
let mixedSamples: Float32Array | null = null;

function samplesFor(selection: AudioChannelSelection): Float32Array {
  if (selection !== 'mix') return selectChannelSamples(channels, selection);
  mixedSamples ??= selectChannelSamples(channels, 'mix');
  return mixedSamples;
}

workerScope.onmessage = (event) => {
  const message = event.data;
  if (message.type === 'load') {
    channels = message.channels;
    sampleRate = message.sampleRate;
    mixedSamples = null;
    return;
  }
  try {
    const samples = samplesFor(message.channel);
    const range = message.range
      ? secondsToSampleRange(message.range, sampleRate, samples.length)
      : { start: 0, end: samples.length };
    const visible = samples.subarray(range.start, range.end);
    const peaks = computeWaveformPeaks(visible, message.columns);
    const spectrogram = computeSpectrogram(visible, {
      sampleRate,
      scale: message.scale,
      maxFrames: message.columns,
    });
    workerScope.postMessage({ requestId: message.requestId, peaks, spectrogram }, [
      peaks.min.buffer,
      peaks.max.buffer,
      spectrogram.values.buffer,
    ]);
  } catch (error) {
    workerScope.postMessage(
      { requestId: message.requestId, error: error instanceof Error ? error.message : String(error) },
      [],
    );
  }
};
