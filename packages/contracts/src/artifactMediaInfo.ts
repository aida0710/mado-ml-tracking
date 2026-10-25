/**
 * Artifactの音声の属性。'header'は登録時にWAV/FLACのヘッダーからデコードせずに読む。'ffprobe'は
 * それ以外の形式についてプレビューのworkerが後から足すもので、'header'を置き換えることは無い。
 */
export interface ArtifactMediaInfo {
  artifactId: string;
  durationSeconds: number;
  sampleRate: number;
  channels: number;
  /** サンプルのビット幅が決まっていないコーデックではnull。 */
  bitsPerSample: number | null;
  /** ffprobeのcodec_name。pcm_s16leやflacなど。 */
  codec: string;
  source: 'header' | 'ffprobe';
}

/** GET /projects/:p/artifact-media-infoの1リクエストで指定できるartifactIdsの最大数。 */
export const ARTIFACT_MEDIA_INFO_BATCH_LIMIT = 200;
