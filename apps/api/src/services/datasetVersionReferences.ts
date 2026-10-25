import { rows, type Connection } from '../db/database.js';
import { DomainError } from '../domain/errors.js';
import { assertProjectReferences } from '../repositories/registryRepository.js';

// バージョンの削除やDatasetのアーカイブと並行して、DatasetVersionへの新しい参照（Runの入力、
// Task・自動実行ルール・フックがRunを始めるときの入力、バージョンの親）を保存する。

interface LockedDataset {
  id: string;
  name: string;
  archivedAt: string | null;
}

/**
 * このトランザクションが参照しようとしているDatasetVersionが、コミットまでに削除されないように
 * し、それらがあることを確かめ直す。DatasetVersionDeletionServiceは参照を数える前にバージョンの
 * DatasetをFOR UPDATEでロックするので、両者はDatasetの行を順番に取る。後から来た削除は新しい
 * 参照を数えて409を返し、先にコミットした削除はバージョンを消しているので、ロック後の確認が
 * 404を返す。
 *
 * `numberingDatasetId`は、このトランザクションが新しいバージョンに番号を振るDatasetで、その
 * Datasetを独占する必要がある。このときはすべてのDatasetをFOR UPDATEでロックする。どちらの場合も
 * 1つの文でidの順にロックを取るので、互いのDatasetをロックし合う2つのトランザクションが
 * デッドロックすることはない。
 */
export async function lockDatasetsOfVersions(
  connection: Connection,
  reference: { projectId: string; versionIds: string[]; numberingDatasetId?: string },
): Promise<LockedDataset[]> {
  const { projectId, versionIds, numberingDatasetId } = reference;
  if (!versionIds.length && !numberingDatasetId) return [];
  const lockMode = numberingDatasetId ? 'FOR UPDATE' : 'FOR SHARE';
  const datasets = await rows<LockedDataset>(
    connection,
    `SELECT d.id,d.name,d.archived_at FROM datasets d
    WHERE d.project_id=$1
      AND (d.id=$3 OR d.id IN (SELECT dataset_id FROM dataset_versions WHERE project_id=$1 AND id=ANY($2::uuid[])))
    ORDER BY d.id ${lockMode} OF d`,
    [projectId, versionIds, numberingDatasetId ?? null],
  );
  // ロックを待つ間に削除されたバージョンは、この時点で消えている。
  await assertProjectReferences(connection, { table: 'dataset_versions', projectId, ids: versionIds });
  return datasets;
}

/**
 * アーカイブ済みのDatasetと、その間に削除されたバージョンを、新しいRunや後でRunを始めるもの
 * （Task・自動実行ルール・フック）の入力として拒む。既存のRunとJobは参照をそのまま持つ。これを
 * 呼ぶのは新しい参照を保存するときだけ。
 */
export async function assertInputDatasetVersionsUsable(
  connection: Connection,
  reference: { projectId: string; ids: string[] },
): Promise<void> {
  // アーカイブ済みのものだけでなく入力のDatasetをすべてロックし、コミット前にアーカイブが
  // 割り込めないようにする（RegistryService.updateDatasetが同じ行を更新する）。
  const datasets = await lockDatasetsOfVersions(connection, {
    projectId: reference.projectId,
    versionIds: reference.ids,
  });
  const archivedNames = datasets
    .filter((dataset) => dataset.archivedAt)
    .map((dataset) => dataset.name);
  if (archivedNames.length)
    throw new DomainError({
      status: 422,
      code: 'dataset_archived',
      message: `versions of archived datasets cannot be inputs of new runs: ${archivedNames.join(', ')}`,
      details: { datasets: archivedNames },
    });
}
