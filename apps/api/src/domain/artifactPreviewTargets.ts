import { BROWSER_AUDIO_ANALYSIS_MAX_BYTES, type ArtifactPreviewKind } from '@mmt/contracts';

const AUDIO_PREVIEW_KINDS: readonly ArtifactPreviewKind[] = ['waveform-peaks', 'spectrogram'];
const VIDEO_PREVIEW_KINDS: readonly ArtifactPreviewKind[] = ['video-poster'];

/**
 * 新しく登録したArtifactに要るプレビュー。音声は、ブラウザで解析できない（大きさの上限を超える）
 * ときか、メディア情報をffprobeでしか読めないときに作る。小さなWAV/FLACはブラウザとヘッダーの
 * 読み取りで足りる。動画には必ずポスター画像を作る。
 */
export function previewKindsFor(artifact: {
  mimeType: string;
  size: number;
  /** 登録のときに、この型のメディア情報をヘッダーから読むか。 */
  isHeaderProbed: boolean;
}): readonly ArtifactPreviewKind[] {
  if (artifact.size === 0) return [];
  const essence = artifact.mimeType.split(';')[0]!.trim().toLowerCase();
  if (essence.startsWith('video/')) return VIDEO_PREVIEW_KINDS;
  if (!essence.startsWith('audio/')) return [];
  if (artifact.isHeaderProbed && artifact.size <= BROWSER_AUDIO_ANALYSIS_MAX_BYTES) return [];
  return AUDIO_PREVIEW_KINDS;
}
