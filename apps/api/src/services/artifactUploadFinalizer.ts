import { createHash, randomUUID } from 'node:crypto';
import type { Artifact } from '@mmt/contracts';
import {
  ArtifactNotFoundError,
  ArtifactPartTooSmallError,
  ArtifactUploadNotFoundError,
  type ArtifactStores,
} from '@mmt/platform';
import { first, transaction, type Connection, type Database } from '../db/database.js';
import {
  artifactUploadColumns,
  listArtifactUploadParts,
  runLifecycleStage,
  type ArtifactUploadRecord,
} from '../repositories/artifactUploadRepository.js';
import { registerStoredArtifact } from './artifactRegistration.js';
import { PollingLoop } from './pollingLoop.js';

// GETでpollするクライアントがすぐ進み具合を見られるよう、verifyingのセッションは1秒以内に拾う。
const IDLE_POLL_MS = 1000;
// オブジェクトを読んでいる間は更新する。ほかのAPIのプロセスは、これが切れてから引き継ぐ。
const LEASE_SECONDS = 120;
const LEASE_RENEW_MS = 30_000;
// 保存先やデータベースの障害では、leaseが切れたあとに再試行する。この回数失敗したセッションは、
// いつまでも再試行せずにfailedにする。
const MAX_FINALIZE_ATTEMPTS = 5;
const FINALIZE_BATCH_SIZE = 10;

/** artifact_uploads.errorに保存する失敗のコード。どのコードでも保存したバイト列は消す。 */
type RejectionCode =
  | 'sha256_mismatch'
  | 'size_mismatch'
  | 'part_too_small'
  | 'assembled_object_missing'
  | 'run_deleted'
  | 'finalize_failed';

/** 互換レイヤーが、登録のトランザクションの中でArtifactを索引に登録できるようにする。 */
export type ArtifactUploadRegisteredHook = (
  connection: Connection,
  upload: ArtifactUploadRecord,
  artifact: Artifact,
) => Promise<void>;

interface ClaimedUpload {
  upload: ArtifactUploadRecord;
  leaseId: string;
}

/**
 * verifyingのセッションを1つずつ組み立て、オブジェクト全体を1回のストリーム読み取りで
 * ハッシュし、Artifactを登録する。ハッシュはpartごとに積み上げず、組み立てたオブジェクトから
 * 計算する。ハッシュの途中状態は保存できず、再起動したAPIでも完了させられる必要があるため。
 */
export class ArtifactUploadFinalizer {
  private readonly loop = new PollingLoop({
    intervalMs: IDLE_POLL_MS,
    run: () => this.finalizeBatch(),
    failureEvent: 'artifact_upload_finalize_batch_failed',
  });

  constructor(
    private readonly options: {
      database: Database;
      stores: ArtifactStores;
      onRegistered?: ArtifactUploadRegisteredHook;
    },
  ) {}

  start(): void {
    this.loop.start();
  }

  stop(): Promise<void> {
    return this.loop.stop();
  }

  /** leaseの空いたverifyingのセッションを完了させ、処理した数を返す。 */
  async finalizeBatch(limit = FINALIZE_BATCH_SIZE): Promise<number> {
    let processed = 0;
    for (; processed < limit; processed++) {
      const claimed = await this.claim();
      if (!claimed) break;
      await this.finalize(claimed);
    }
    return processed;
  }

  private async claim(): Promise<ClaimedUpload | null> {
    const leaseId = randomUUID();
    const upload = await first<ArtifactUploadRecord>(
      this.options.database,
      `UPDATE artifact_uploads SET finalizer_lease_id=$1,finalizer_locked_at=now(),
        finalizer_attempts=finalizer_attempts+1
      WHERE id=(SELECT id FROM artifact_uploads WHERE status='verifying'
        AND (finalizer_locked_at IS NULL OR finalizer_locked_at<now()-make_interval(secs=>$2))
        ORDER BY updated_at LIMIT 1 FOR UPDATE SKIP LOCKED)
      RETURNING ${artifactUploadColumns}`,
      [leaseId, LEASE_SECONDS],
    );
    return upload ? { upload, leaseId } : null;
  }

  private async finalize(claimed: ClaimedUpload): Promise<void> {
    const { database } = this.options;
    const renewal = setInterval(() => {
      void database
        .query(
          'UPDATE artifact_uploads SET finalizer_locked_at=now() WHERE id=$1 AND finalizer_lease_id=$2',
          [claimed.upload.id, claimed.leaseId],
        )
        .catch(() => undefined);
    }, LEASE_RENEW_MS);
    renewal.unref();
    try {
      const verified = await this.assembleAndVerify(claimed.upload);
      if ('rejection' in verified) return await this.reject(claimed, verified.rejection);
      const rejection = await this.register(claimed, verified);
      if (rejection) await this.reject(claimed, rejection);
    } catch {
      // セッションはverifyingのまま残り、leaseが切れたあとの次のclaimで再試行される。
      console.error(
        JSON.stringify({
          event: 'artifact_upload_finalize_failed',
          uploadId: claimed.upload.id,
          attempt: claimed.upload.finalizerAttempts,
        }),
      );
      if (claimed.upload.finalizerAttempts >= MAX_FINALIZE_ATTEMPTS)
        await this.reject(claimed, 'finalize_failed').catch(() => undefined);
    } finally {
      clearInterval(renewal);
    }
  }

  private async assembleAndVerify(
    upload: ArtifactUploadRecord,
  ): Promise<{ size: number; sha256: string } | { rejection: RejectionCode }> {
    const { database, stores } = this.options;
    const multipart = stores.multipart(upload.backend);
    if (!multipart) throw new Error('Artifact backend no longer accepts multipart uploads');
    const parts = await listArtifactUploadParts(database, upload.id);
    try {
      await multipart.completeMultipart({
        key: upload.storageKey,
        backendUploadId: upload.backendUploadId,
        parts: parts.map(({ partNumber, size, etag }) => ({ partNumber, size, etag })),
      });
    } catch (error) {
      if (error instanceof ArtifactPartTooSmallError) return { rejection: 'part_too_small' };
      // 前の試行が止まる前に、保存先へのアップロードを完了させていた。そのオブジェクトを検証する。
      if (!(error instanceof ArtifactUploadNotFoundError)) throw error;
    }
    let content;
    try {
      content = await stores.read({ backend: upload.backend, key: upload.storageKey });
    } catch (error) {
      if (error instanceof ArtifactNotFoundError) return { rejection: 'assembled_object_missing' };
      throw error;
    }
    const digest = createHash('sha256');
    let size = 0;
    for await (const chunk of content.body) {
      const bytes = chunk as Buffer;
      digest.update(bytes);
      size += bytes.length;
    }
    const sha256 = digest.digest('hex');
    if (size !== upload.expectedSize) return { rejection: 'size_mismatch' };
    if (upload.expectedSha256 && upload.expectedSha256 !== sha256)
      return { rejection: 'sha256_mismatch' };
    return { size, sha256 };
  }

  /** オブジェクトの検証中にRunが削除されていたら、拒否の理由を返す。 */
  private async register(
    claimed: ClaimedUpload,
    stored: { size: number; sha256: string },
  ): Promise<RejectionCode | null> {
    const { upload } = claimed;
    return transaction(this.options.database, async (connection) => {
      const current = await first<{ id: string }>(
        connection,
        `SELECT id FROM artifact_uploads WHERE id=$1 AND finalizer_lease_id=$2
        AND status='verifying' FOR UPDATE`,
        [upload.id, claimed.leaseId],
      );
      // このleaseが切れたあとに別のfinalizerが引き継いだ。Artifactはそちらが登録する。
      if (!current) return null;
      if (upload.runId) {
        const stage = await runLifecycleStage(connection, {
          projectId: upload.projectId,
          runId: upload.runId,
        });
        if (stage !== 'active') return 'run_deleted';
      }
      const artifact = await registerStoredArtifact(
        connection,
        {
          id: upload.id,
          projectId: upload.projectId,
          runId: upload.runId,
          path: upload.path,
          backend: upload.backend,
          storageKey: upload.storageKey,
          mimeType: upload.mimeType,
          size: stored.size,
          sha256: stored.sha256,
        },
        { stores: this.options.stores },
      );
      await this.options.onRegistered?.(connection, upload, artifact);
      await connection.query(
        `UPDATE artifact_uploads SET status='completed',artifact_id=$2,error=NULL,
          finalizer_lease_id=NULL,finalizer_locked_at=NULL,updated_at=now() WHERE id=$1`,
        [upload.id, artifact.id],
      );
      return null;
    });
  }

  /**
   * 失敗を記録する前にバイト列を消す。その間にプロセスが止まっても、再試行でセッションをもう一度
   * 拒むので、参照されないオブジェクトが残らない。
   */
  private async reject(claimed: ClaimedUpload, rejection: RejectionCode): Promise<void> {
    const { database, stores } = this.options;
    const { upload } = claimed;
    await stores.remove({ backend: upload.backend, key: upload.storageKey });
    await stores.multipart(upload.backend)?.abortMultipart({
      key: upload.storageKey,
      backendUploadId: upload.backendUploadId,
    });
    await database.query(
      `UPDATE artifact_uploads SET status='failed',error=$3,finalizer_lease_id=NULL,
        finalizer_locked_at=NULL,updated_at=now()
      WHERE id=$1 AND finalizer_lease_id=$2 AND status='verifying'`,
      [upload.id, claimed.leaseId, rejection],
    );
  }
}
