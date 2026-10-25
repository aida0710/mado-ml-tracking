import type { ArtifactBackend } from '@mmt/contracts';
import { rows, type Connection } from '../db/database.js';

/** 削除した行だけが指していて、ArtifactGarbageCollectorを待っているblob。 */
export interface QueuedBlob {
  /** キューの中でblobを識別する。 */
  id: string;
  backend: ArtifactBackend;
  storageKey: string;
}

/**
 * 消してよいblobを記録する場所と、消したことを書き戻す方法。どちらのキューも消した後に行を残す
 * （removed_at / blob_removed_at）ので、途中で打ち切られた回の処理は次の回が終わらせる。
 */
export interface BlobRemovalQueue {
  /** ログに出すidのフィールド名。エラー名と並べて出すだけ（ストレージのキーはログに出さない）。 */
  logIdField: string;
  /** `queuedBefore`以前にキューに入ったblobを古い順に返す。`excluded`にあるものは除く。 */
  due(
    connection: Connection,
    filter: { queuedBefore: Date; excluded: readonly string[]; limit: number },
  ): Promise<QueuedBlob[]>;
  markRemoved(connection: Connection, blob: QueuedBlob): Promise<void>;
  markFailed(
    connection: Connection,
    failure: { blob: QueuedBlob; errorName: string },
  ): Promise<void>;
}

/** ArtifactのAPIかMLflowから削除したArtifactのblob（migration 049）。 */
export const deletedArtifactBlobs: BlobRemovalQueue = {
  logIdField: 'artifactId',
  due: (connection, filter) =>
    rows<QueuedBlob>(
      connection,
      `SELECT a.id,a.backend,a.storage_key FROM artifact_deletions d
       JOIN artifacts a ON a.id=d.artifact_id
       WHERE d.blob_removed_at IS NULL AND a.deleted_at<=$1 AND NOT d.artifact_id=ANY($2::uuid[])
       ORDER BY a.deleted_at,a.id LIMIT $3`,
      [filter.queuedBefore, filter.excluded, filter.limit],
    ),
  markRemoved: async (connection, blob) => {
    await connection.query(
      `UPDATE artifact_deletions SET blob_removed_at=now(),last_removal_error=NULL
       WHERE artifact_id=$1 AND blob_removed_at IS NULL`,
      [blob.id],
    );
  },
  markFailed: async (connection, { blob, errorName }) => {
    await connection.query(
      `UPDATE artifact_deletions SET removal_attempts=removal_attempts+1,last_removal_error=$2
       WHERE artifact_id=$1`,
      [blob.id, errorName],
    );
  },
};

/** 完全に削除（purge）したProjectのblob（migration 055）。Artifactの行はもう無い。 */
export const purgedProjectBlobs: BlobRemovalQueue = {
  logIdField: 'purgedProjectBlobId',
  due: (connection, filter) =>
    rows<QueuedBlob>(
      connection,
      `SELECT id,backend,storage_key FROM purged_project_blobs
       WHERE removed_at IS NULL AND queued_at<=$1 AND NOT id=ANY($2::uuid[])
       ORDER BY queued_at,id LIMIT $3`,
      [filter.queuedBefore, filter.excluded, filter.limit],
    ),
  markRemoved: async (connection, blob) => {
    await connection.query(
      `UPDATE purged_project_blobs SET removed_at=now(),last_removal_error=NULL
       WHERE id=$1 AND removed_at IS NULL`,
      [blob.id],
    );
  },
  markFailed: async (connection, { blob, errorName }) => {
    await connection.query(
      `UPDATE purged_project_blobs SET removal_attempts=removal_attempts+1,last_removal_error=$2
       WHERE id=$1`,
      [blob.id, errorName],
    );
  },
};
