import { first, type Connection } from '../db/database.js';
import { conflict, notFound } from '../domain/errors.js';
import { MAX_MODEL_VERSION_DIGITS, MAX_NUMERIC_MODEL_VERSION } from '../mlflow/models/limits.js';

// "v1"のようなバージョンや、bigintのカウンタに収まらない数は、有効なままだが番号は振らない。
const NUMBERED_VERSION_PATTERN = new RegExp(`^[0-9]{1,${MAX_MODEL_VERSION_DIGITS}}$`);

function isNumberedVersion(version: string): boolean {
  return NUMBERED_VERSION_PATTERN.test(version);
}

/**
 * Modelの行をロックし、挿入するバージョンを決める。
 * バージョンを省くとmodels.next_versionを使う。整数のバージョンを明示するとカウンタをその先へ
 * 進め、後の自動の番号がぶつかったり、削除した番号を使い回したりしないようにする。
 * 呼び出し側は、ロックを持つのと同じトランザクションでバージョンを挿入する必要がある。
 */
export async function reserveModelVersion(
  connection: Connection,
  reservation: { projectId: string; modelId: string; version?: string },
): Promise<string> {
  const model = await first<{ nextVersion: string }>(
    connection,
    'SELECT next_version::text AS next_version FROM models WHERE id=$1 AND project_id=$2 FOR UPDATE',
    [reservation.modelId, reservation.projectId],
  );
  if (!model) notFound('model');
  const requested = reservation.version;
  if (requested !== undefined) {
    if (isNumberedVersion(requested))
      await connection.query(
        'UPDATE models SET next_version=GREATEST(next_version,$2::bigint+1) WHERE id=$1',
        [reservation.modelId, requested],
      );
    return requested;
  }
  if (BigInt(model.nextVersion) > MAX_NUMERIC_MODEL_VERSION)
    conflict('the model version number has reached its limit');
  await connection.query('UPDATE models SET next_version=next_version+1 WHERE id=$1', [
    reservation.modelId,
  ]);
  return model.nextVersion;
}
