import type { ArtifactMediaInfo } from '@mmt/contracts';

/** ビューアが一覧に出す音声の属性。デコードした値か、デコード前は保存されたヘッダーの値。 */
export interface AudioMediaSummary {
  sampleRate: number;
  /** デコーダーがファイルのレートを読めず、自分の出力のレートを返したときはfalse。 */
  sampleRateFromFile: boolean;
  channelCount: number;
  durationSeconds: number;
}

/** デコードした値を優先する。ヘッダーと食い違っても、実際に再生されるものを表しているため。 */
export function summarizeAudioMedia(
  decoded: AudioMediaSummary | null,
  header: ArtifactMediaInfo | null,
): AudioMediaSummary | null {
  if (decoded) return decoded;
  if (!header) return null;
  return {
    sampleRate: header.sampleRate,
    sampleRateFromFile: true,
    channelCount: header.channels,
    durationSeconds: header.durationSeconds,
  };
}
