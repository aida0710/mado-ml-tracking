// プレビューのworkerのプロセス。ffmpegで波形のピーク、スペクトログラム、動画のポスター画像を作る。
// APIとは別に動かし（composeのサービス`preview`、Dockerfile.preview）、APIのイメージにffmpegを
// 入れず、長いデコードがリクエストの処理と競合しないようにする。
import { setTimeout as sleep } from 'node:timers/promises';
import { createArtifactStoresFromEnv } from '@mmt/platform';
import { createDatabase } from './db/database.js';
import { loadPreviewWorkerConfig } from './previewWorkerConfig.js';
import { ArtifactPreviewProcessor } from './services/artifactPreviewProcessor.js';
import { ArtifactStoreRegistry } from './services/artifactStoreRegistry.js';

const config = loadPreviewWorkerConfig();
const database = createDatabase(config.databaseUrl);
database.on('error', () => console.error(JSON.stringify({ event: 'database_pool_error' })));
const stores = new ArtifactStoreRegistry({
  database,
  environmentStores: createArtifactStoresFromEnv(),
  secretKey: config.storageSecretKey,
});
const processor = new ArtifactPreviewProcessor({
  database,
  stores,
  tools: {
    ffmpegPath: config.ffmpegPath,
    ffprobePath: config.ffprobePath,
    timeoutMs: config.toolTimeoutMs,
  },
  workDirectory: config.workDirectory,
  maxSourceBytes: config.maxSourceBytes,
});

const shutdownSignal = new AbortController();

/**
 * キューを空になるまで処理してから、ポーリングの間隔だけ待つ。PollingLoop（APIのHTTPサーバーが
 * プロセスを生かしているのでタイマーをunrefしている）と違い、このプロセスを動かし続けているのは
 * このループ。停止を求められても、処理中のArtifactは終わらせてから止まる。
 */
async function runUntilStopped(): Promise<void> {
  while (!shutdownSignal.signal.aborted) {
    try {
      await stores.ensureLoaded();
      while (!shutdownSignal.signal.aborted && (await processor.processNext()));
    } catch (error) {
      console.error(JSON.stringify({ event: 'artifact_preview_worker_failed', name: (error as Error).name }));
    }
    await sleep(config.pollIntervalMs, undefined, { signal: shutdownSignal.signal }).catch(() => undefined);
  }
}

const running = runUntilStopped();
console.log(JSON.stringify({ event: 'artifact_preview_worker_started' }));

async function shutdown(): Promise<void> {
  if (shutdownSignal.signal.aborted) return;
  shutdownSignal.abort();
  await running;
  await database.end();
}
process.once('SIGTERM', () => {
  void shutdown();
});
process.once('SIGINT', () => {
  void shutdown();
});
