/** プレビューのworkerが長い音声と動画について生成する派生ファイル。 */
export const ARTIFACT_PREVIEW_KINDS = ['waveform-peaks', 'spectrogram', 'video-poster'] as const;
export type ArtifactPreviewKind = (typeof ARTIFACT_PREVIEW_KINDS)[number];
export type ArtifactPreviewStatus = 'queued' | 'running' | 'ready' | 'failed' | 'skipped';

/**
 * この大きさまでの音声はブラウザが自分でデコードして解析する（画面のビューアの
 * AUDIO_ANALYSIS_MAX_BYTES）。ヘッダーを読める音声でこれより大きいものは、代わりにサーバーで
 * プレビューを作る。
 */
export const BROWSER_AUDIO_ANALYSIS_MAX_BYTES = 64 * 1024 * 1024;

export interface ArtifactPreview {
  artifactId: string;
  kind: ArtifactPreviewKind;
  status: ArtifactPreviewStatus;
  /** 生成したファイル（Runを持たないArtifact）。statusが'ready'のときだけ入る。 */
  previewArtifactId: string | null;
  /** render_failedやffmpeg_unavailableのような短いコード。failedかskippedのとき以外はnull。 */
  error: string | null;
  attempts: number;
  updatedAt: string;
}

/** 'waveform-peaks'のプレビューのArtifactの中身（application/json）。 */
export interface WaveformPeaksPreview {
  version: 1;
  /** 音声をデコードしたサンプルレート。スペクトログラムの画像は0 Hzからその半分までを表す。 */
  sampleRate: number;
  durationSeconds: number;
  samplesPerPeak: number;
  /** モノラルに混ぜた値。ファイル全体を等分した区間ごとに1組で、-1から1の間。 */
  min: number[];
  max: number[];
}
