import type { Connection } from '../db/database.js';
import { parseMlflowImagePath } from '../domain/mlflowMediaPaths.js';
import {
  attachMlflowThumbnail,
  findCurrentRunArtifacts,
  insertMlflowImage,
} from '../repositories/runMediaRepository.js';

const INDEX_SAVEPOINT = 'run_media_index';

export interface SavedRunArtifact {
  projectId: string;
  runId: string;
  artifactId: string;
  /** RunのArtifactのルートの中でのパス。 */
  path: string;
}

/**
 * MLflowのlog_image(key=, step=)のファイルを、Artifactを登録するトランザクションの中で、Runの
 * メディアとして索引に入れる。2つのファイルのどちらが先に届いても、圧縮した.webpが画像の行の
 * サムネイルになる。索引は補助的なものなので、失敗してもArtifactの保存は失敗させず、
 * savepointまで巻き戻してログに残す。
 */
export async function indexMlflowMediaArtifact(
  connection: Connection,
  saved: SavedRunArtifact,
): Promise<void> {
  const image = parseMlflowImagePath(saved.path);
  if (!image) return;
  await connection.query(`SAVEPOINT ${INDEX_SAVEPOINT}`);
  try {
    if (image.compressed)
      await attachMlflowThumbnail(connection, {
        projectId: saved.projectId,
        runId: saved.runId,
        imagePath: image.imagePath,
        thumbnailArtifactId: saved.artifactId,
      });
    else {
      const [thumbnail] = await findCurrentRunArtifacts(connection, {
        projectId: saved.projectId,
        files: [{ runId: saved.runId, path: image.compressedPath }],
      });
      await insertMlflowImage(connection, {
        projectId: saved.projectId,
        runId: saved.runId,
        key: image.key,
        step: image.step,
        artifactId: saved.artifactId,
        thumbnailArtifactId: thumbnail?.id ?? null,
        metadata: { timestamp: image.timestamp },
      });
    }
    await connection.query(`RELEASE SAVEPOINT ${INDEX_SAVEPOINT}`);
  } catch (error) {
    await connection.query(`ROLLBACK TO SAVEPOINT ${INDEX_SAVEPOINT}`);
    // SQLの詳細はログに出さない。backfillで索引を作り直すファイルは、Artifactのidで分かる。
    console.error(
      JSON.stringify({
        event: 'run_media_index_failed',
        artifactId: saved.artifactId,
        projectId: saved.projectId,
        name: (error as Error).name,
      }),
    );
  }
}
