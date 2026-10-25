import type { ArtifactStores } from '@mmt/platform';
import type { Database } from '../db/database.js';
import {
  deletedArtifactBlobs,
  purgedProjectBlobs,
  type BlobRemovalQueue,
  type QueuedBlob,
} from '../repositories/blobRemovalQueues.js';
import { PollingLoop } from './pollingLoop.js';
import type { ArtifactUploadSweep, ArtifactUploadSweeper } from './artifactUploadSweeper.js';

// collectorが引き継ぐ前、アップロードのsweeperはこの間隔で動いていた。何日もの猶予期間のあとの
// blobの削除も、分単位の差は気にしない。
const COLLECT_INTERVAL_MS = 10 * 60 * 1000;
// 1回のクエリで扱うblobの数。1回の実行の中で、期限の来たblobが無くなるまで続けて取る。
const REMOVAL_BATCH_SIZE = 200;
const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;
// artifact_deletionsとpurged_project_blobsのlast_removal_errorに合わせる。
const MAX_ERROR_NAME_LENGTH = 64;

export interface ArtifactGarbageCollection {
  /** この実行で消した、削除済みArtifactと完全に削除したProjectのblob。 */
  removedBlobs: number;
  /** 削除に失敗したblob。次の実行で再試行する。 */
  failedBlobs: number;
  uploads: ArtifactUploadSweep;
}

// 削除済みArtifactを先にする。よくあるのはこちらで、猶予期間も先に始まっている。
const BLOB_REMOVAL_QUEUES: readonly BlobRemovalQueue[] = [deletedArtifactBlobs, purgedProjectBlobs];

/**
 * もう何からも指されていない保存領域を消す。猶予期間より前に削除したArtifactや完全に削除した
 * Projectのblobと、（ArtifactUploadSweeperを通して）期限切れのアップロードセッション、宙に浮いた
 * multipartアップロード、放置されたstagingのファイル。blobに触る前に削除はDBでコミット済みで、
 * 無いblobの削除も成功するので、途中で切れた実行は次の実行が終わらせる。
 */
export class ArtifactGarbageCollector {
  private readonly loop = new PollingLoop({
    intervalMs: COLLECT_INTERVAL_MS,
    run: () => this.collect(),
    failureEvent: 'artifact_garbage_collection_failed',
  });

  constructor(
    private readonly options: {
      database: Database;
      stores: ArtifactStores;
      uploadSweeper: ArtifactUploadSweeper;
      deleteGraceDays: number;
    },
  ) {}

  start(): void {
    this.loop.start();
  }

  stop(): Promise<void> {
    return this.loop.stop();
  }

  async collect(now = new Date()): Promise<ArtifactGarbageCollection> {
    const queuedBefore = new Date(
      now.getTime() - this.options.deleteGraceDays * MILLISECONDS_PER_DAY,
    );
    let removedBlobs = 0;
    let failedBlobs = 0;
    for (const queue of BLOB_REMOVAL_QUEUES) {
      const emptied = await this.emptyQueue(queue, queuedBefore);
      removedBlobs += emptied.removedBlobs;
      failedBlobs += emptied.failedBlobs;
    }
    return { removedBlobs, failedBlobs, uploads: await this.options.uploadSweeper.sweep(now) };
  }

  private async emptyQueue(
    queue: BlobRemovalQueue,
    queuedBefore: Date,
  ): Promise<Pick<ArtifactGarbageCollection, 'removedBlobs' | 'failedBlobs'>> {
    let removedBlobs = 0;
    const failed: string[] = [];
    for (;;) {
      const due = await queue.due(this.options.database, {
        queuedBefore,
        excluded: failed,
        limit: REMOVAL_BATCH_SIZE,
      });
      for (const blob of due) {
        if (await this.removeBlob(queue, blob)) removedBlobs++;
        else failed.push(blob.id);
      }
      if (due.length < REMOVAL_BATCH_SIZE) return { removedBlobs, failedBlobs: failed.length };
    }
  }

  private async removeBlob(queue: BlobRemovalQueue, blob: QueuedBlob): Promise<boolean> {
    try {
      // blob自身の保存先。保存先を無効にしたあとも読める（消せる）。
      await this.options.stores.remove({ backend: blob.backend, key: blob.storageKey });
    } catch (error) {
      const errorName = ((error as Error)?.name ?? 'Error').slice(0, MAX_ERROR_NAME_LENGTH);
      await queue.markFailed(this.options.database, { blob, errorName });
      // 変わらないidとエラー名だけを出す。保存キーからバケットの構成が分かることがある。
      console.error(
        JSON.stringify({
          event: 'artifact_blob_removal_failed',
          [queue.logIdField]: blob.id,
          name: errorName,
        }),
      );
      return false;
    }
    await queue.markRemoved(this.options.database, blob);
    return true;
  }
}
