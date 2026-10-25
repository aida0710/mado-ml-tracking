import type { ArtifactPreview, WaveformPeaksPreview } from '@mmt/contracts';
import type { WaveformPeaks } from './audioAnalysis';

/** 'waveform-peaks'のプレビューのArtifactから読み出した、サーバーが作るファイル全体の波形。 */
export interface ServerWaveform {
  peaks: WaveformPeaks;
  sampleRate: number;
  durationSeconds: number;
}

/** ブラウザで解析するには大きすぎるファイルについて、ビューアが表示できるもの。 */
export type ServerAudioPreviewSummary =
  | { status: 'none' }
  | { status: 'pending' }
  | { status: 'failed' }
  | { status: 'ready'; peaksArtifactId: string; spectrogramArtifactId: string | null };

// プレビューのworkerが書くピークは最大8192個。大きく超えるものはworkerが作ったものではない。
const MAX_PEAK_COUNT = 65536;

function isPeakArray(value: unknown): value is number[] {
  return (
    Array.isArray(value) &&
    value.length <= MAX_PEAK_COUNT &&
    value.every((peak) => typeof peak === 'number' && peak >= -1 && peak <= 1)
  );
}

/** バージョン1のピークの文書でなければnull。 */
export function parseWaveformPeaksPreview(text: string): ServerWaveform | null {
  let document: Partial<WaveformPeaksPreview>;
  try {
    document = JSON.parse(text) as Partial<WaveformPeaksPreview>;
  } catch {
    return null;
  }
  if (typeof document !== 'object' || document === null || document.version !== 1) return null;
  const { sampleRate, durationSeconds, min, max } = document;
  if (!Number.isInteger(sampleRate) || sampleRate! <= 0) return null;
  if (typeof durationSeconds !== 'number' || !Number.isFinite(durationSeconds) || durationSeconds < 0) return null;
  if (!isPeakArray(min) || !isPeakArray(max) || min.length !== max.length || min.length === 0) return null;
  return {
    peaks: { min: Float32Array.from(min), max: Float32Array.from(max) },
    sampleRate: sampleRate!,
    durationSeconds,
  };
}

/**
 * 状態は波形で決まる。波形が無ければ描くものが無い。スペクトログラムが無くても、その行が空に
 * なるだけ。'skipped'（サーバーにffmpegが無い、音声のストリームが無い）は、利用者がやり直せる
 * ことが無いので'none'とみなす。
 */
export function summarizeServerAudioPreviews(previews: readonly ArtifactPreview[]): ServerAudioPreviewSummary {
  const peaks = previews.find((preview) => preview.kind === 'waveform-peaks');
  const spectrogram = previews.find((preview) => preview.kind === 'spectrogram');
  if (!peaks || peaks.status === 'skipped') return { status: 'none' };
  if (peaks.status === 'queued' || peaks.status === 'running') return { status: 'pending' };
  if (peaks.status === 'failed' || !peaks.previewArtifactId) return { status: 'failed' };
  return {
    status: 'ready',
    peaksArtifactId: peaks.previewArtifactId,
    spectrogramArtifactId: spectrogram?.status === 'ready' ? spectrogram.previewArtifactId : null,
  };
}
