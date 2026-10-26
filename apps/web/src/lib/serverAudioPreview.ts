import type { ArtifactPreview } from '@mmt/contracts';
import { waveformPeaksPreviewSchema } from '@mmt/contracts/schemas';
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

/** バージョン1のピークの文書でなければnull。 */
export function parseWaveformPeaksPreview(text: string): ServerWaveform | null {
  let document: unknown;
  try {
    document = JSON.parse(text);
  } catch {
    return null;
  }
  const parsed = waveformPeaksPreviewSchema.safeParse(document);
  if (!parsed.success) return null;
  const { min, max, sampleRate, durationSeconds } = parsed.data;
  return { peaks: { min: Float32Array.from(min), max: Float32Array.from(max) }, sampleRate, durationSeconds };
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
