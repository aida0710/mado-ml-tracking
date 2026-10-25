import type { ArtifactBackend } from '@mmt/contracts';
import type { ArtifactStores, IncompleteMultipartUpload } from '@mmt/platform';
import { rows, type Database } from '../db/database.js';
import { PollingLoop } from './pollingLoop.js';
import { UPLOAD_SESSION_LIFETIME_MS } from './artifactUploadService.js';

// セッションの期限は日単位なので、気づくのが数分遅れても害は無い。
const SWEEP_INTERVAL_MS = 10 * 60 * 1000;
const EXPIRE_BATCH_SIZE = 100;
// 有効期間を超えて残るセッションは無く、1回のリクエストでのアップロードに1週間かかることも
// 現実的でない。そのため、openかverifyingのセッションが無い、これより古い保存先の
// アップロードには、書き手が残っていない。
const ORPHANED_UPLOAD_AGE_MS = UPLOAD_SESSION_LIFETIME_MS;
// アップロードのリクエストは、データが来ないまま120秒たつとタイムアウトする
// （MMT_UPLOAD_IDLE_TIMEOUT_MS）。そのため、1日触られていないstagingのファイルは、書き込みの
// 途中で止まったプロセスのもの。
const ABANDONED_STAGING_IDLE_MS = 24 * 60 * 60 * 1000;

export interface ArtifactUploadSweep {
  expiredSessions: number;
  abortedOrphanedUploads: number;
  removedStagingFiles: number;
}

/** 古いセッションを期限切れにし、中断・放置されたアップロードが残した保存領域を消す。 */
export class ArtifactUploadSweeper {
  private readonly loop = new PollingLoop({
    intervalMs: SWEEP_INTERVAL_MS,
    run: () => this.sweep(),
    failureEvent: 'artifact_upload_sweep_failed',
  });

  constructor(private readonly options: { database: Database; stores: ArtifactStores }) {}

  start(): void {
    this.loop.start();
  }

  stop(): Promise<void> {
    return this.loop.stop();
  }

  async sweep(now = new Date()): Promise<ArtifactUploadSweep> {
    const expiredSessions = await this.expireSessions();
    let abortedOrphanedUploads = 0;
    let removedStagingFiles = 0;
    for (const backend of this.options.stores.backends()) {
      const multipart = this.options.stores.multipart(backend);
      if (!multipart) continue;
      const orphaned = await this.orphanedUploads(
        backend,
        await multipart.listIncompleteUploads(),
        new Date(now.getTime() - ORPHANED_UPLOAD_AGE_MS),
      );
      for (const upload of orphaned) {
        await multipart.abortMultipart(upload);
        abortedOrphanedUploads++;
      }
      removedStagingFiles += await multipart.removeAbandonedStaging(
        new Date(now.getTime() - ABANDONED_STAGING_IDLE_MS),
      );
    }
    return { expiredSessions, abortedOrphanedUploads, removedStagingFiles };
  }

  /** partを捨てる前にセッションを閉じ、そのあとでpartのリクエストが届かないようにする。 */
  private async expireSessions(): Promise<number> {
    const expired = await rows<{
      id: string;
      backend: ArtifactBackend;
      storageKey: string;
      backendUploadId: string;
    }>(
      this.options.database,
      `UPDATE artifact_uploads SET status='expired',updated_at=now()
      WHERE id IN (SELECT id FROM artifact_uploads WHERE status='open' AND expires_at<=now()
        ORDER BY expires_at LIMIT $1 FOR UPDATE SKIP LOCKED)
      RETURNING id,backend,storage_key,backend_upload_id`,
      [EXPIRE_BATCH_SIZE],
    );
    for (const upload of expired) {
      try {
        await this.options.stores.multipart(upload.backend)?.abortMultipart({
          key: upload.storageKey,
          backendUploadId: upload.backendUploadId,
        });
      } catch {
        // セッションはもうopenではないので、宙に浮いたアップロードの処理で再試行される。
        console.error(
          JSON.stringify({ event: 'artifact_upload_expire_abort_failed', uploadId: upload.id }),
        );
      }
    }
    return expired.length;
  }

  private async orphanedUploads(
    backend: ArtifactBackend,
    uploads: IncompleteMultipartUpload[],
    initiatedBefore: Date,
  ): Promise<IncompleteMultipartUpload[]> {
    const candidates = uploads.filter((upload) => upload.initiatedAt < initiatedBefore);
    if (!candidates.length) return [];
    const active = await rows<{ backendUploadId: string }>(
      this.options.database,
      `SELECT backend_upload_id FROM artifact_uploads WHERE backend=$1
      AND backend_upload_id=ANY($2::text[]) AND status IN ('open','verifying')`,
      [backend, candidates.map((upload) => upload.backendUploadId)],
    );
    const activeIds = new Set(active.map((upload) => upload.backendUploadId));
    return candidates.filter((upload) => !activeIds.has(upload.backendUploadId));
  }
}
