import { tmpdir } from 'node:os';
import { requireDatabaseUrl } from './db/databaseSettings.js';
import { z } from 'zod';
import { rejectReplacedEnvironmentVariables } from '@mmt/platform';
import { parseSecretKey, type SecretKey } from './security/secretEncryption.js';

const optionalSetting = z.preprocess(
  (value) => (value === '' ? undefined : value),
  z.string().optional(),
);
// workerがDBを絶え間なくポーリングしなくても、新しいアップロードのプレビューが数秒以内に出る。
const DEFAULT_POLL_INTERVAL_MS = 5000;
// 数時間の録音のデコードには数分かかる。これを過ぎても動いているツールは止まっているとみなす。
const DEFAULT_TOOL_TIMEOUT_MS = 30 * 60 * 1000;
// 1つのjobで最大3つのツールを動かすので、PREVIEW_LEASE_SECONDS（2時間）より十分短くする。
const MAX_TOOL_TIMEOUT_MS = 40 * 60 * 1000;
// 元のファイルは作業ディレクトリへ丸ごとコピーし、そこはシステムのディスクにあることが多い。
// 1つのアップロードでそのディスクが埋まらないよう、これより大きいものは飛ばす
// （MMT_ARTIFACT_MAX_BYTESは200 GiBまで許す）。
const DEFAULT_MAX_SOURCE_BYTES = 10 * 1024 ** 3;

const environmentSchema = z.object({
  MMT_DATABASE_URL: optionalSetting,
  MMT_STORAGE_SECRET_KEY: optionalSetting,
  MMT_PREVIEW_FFMPEG_PATH: z.string().min(1).default('ffmpeg'),
  MMT_PREVIEW_FFPROBE_PATH: z.string().min(1).default('ffprobe'),
  MMT_PREVIEW_POLL_INTERVAL_MS: z.coerce.number().int().min(100).default(DEFAULT_POLL_INTERVAL_MS),
  MMT_PREVIEW_TOOL_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .min(1000)
    .max(MAX_TOOL_TIMEOUT_MS)
    .default(DEFAULT_TOOL_TIMEOUT_MS),
  MMT_PREVIEW_WORK_DIR: optionalSetting,
  MMT_PREVIEW_MAX_SOURCE_BYTES: z.coerce.number().int().min(1).default(DEFAULT_MAX_SOURCE_BYTES),
});

/** プレビューのworkerのプロセス（previewWorker.ts）の設定。APIの設定とは別。 */
export interface PreviewWorkerConfig {
  databaseUrl: string;
  storageSecretKey: SecretKey | null;
  ffmpegPath: string;
  ffprobePath: string;
  pollIntervalMs: number;
  toolTimeoutMs: number;
  workDirectory: string;
  maxSourceBytes: number;
}

export function loadPreviewWorkerConfig(
  environment: NodeJS.ProcessEnv = process.env,
): PreviewWorkerConfig {
  rejectReplacedEnvironmentVariables(environment);
  // 環境変数の値には認証情報が含まれうるので、フィールド名だけを報告する。
  const parsed = environmentSchema.safeParse(environment);
  if (!parsed.success)
    throw new Error(
      `Invalid configuration: ${parsed.error.issues.map((issue) => issue.path.join('.')).join(', ')}`,
    );
  const settings = parsed.data;
  const databaseUrl = requireDatabaseUrl(environment);
  let storageSecretKey: SecretKey | null = null;
  if (settings.MMT_STORAGE_SECRET_KEY) {
    try {
      storageSecretKey = parseSecretKey(settings.MMT_STORAGE_SECRET_KEY);
    } catch {
      throw new Error('MMT_STORAGE_SECRET_KEY must be base64 of 32 bytes');
    }
  }
  return {
    databaseUrl,
    storageSecretKey,
    ffmpegPath: settings.MMT_PREVIEW_FFMPEG_PATH,
    ffprobePath: settings.MMT_PREVIEW_FFPROBE_PATH,
    pollIntervalMs: settings.MMT_PREVIEW_POLL_INTERVAL_MS,
    toolTimeoutMs: settings.MMT_PREVIEW_TOOL_TIMEOUT_MS,
    workDirectory: settings.MMT_PREVIEW_WORK_DIR ?? tmpdir(),
    maxSourceBytes: settings.MMT_PREVIEW_MAX_SOURCE_BYTES,
  };
}
