import { first, type Connection } from '../db/database.js';
import { notFound } from '../domain/errors.js';

/** set_experiment()を呼ぶまで、MLflowのクライアントがDefault Experimentに使うid。 */
export const DEFAULT_EXPERIMENT_ID = '0';
export const DEFAULT_EXPERIMENT_NAME = 'Default';

/**
 * ProjectのDefault Experiment。中に何も記録していなければnull。MLflowには常にDefaultがあるが、
 * ここでは"0"を指定した最初のRunかLogged Modelがそれを作る。
 */
export async function findDefaultExperimentId(
  connection: Connection,
  projectId: string,
): Promise<string | null> {
  const experiment = await first<{ id: string }>(
    connection,
    'SELECT id FROM experiments WHERE project_id=$1 AND name=$2',
    [projectId, DEFAULT_EXPERIMENT_NAME],
  );
  return experiment?.id ?? null;
}

/** MLflowのリクエストにある実験のid。"0"はProjectのDefaultとして読む。 */
export async function resolveExperimentId(
  connection: Connection,
  reference: { projectId: string; id: string },
): Promise<string> {
  if (reference.id !== DEFAULT_EXPERIMENT_ID) return reference.id;
  const id = await findDefaultExperimentId(connection, reference.projectId);
  if (!id) notFound('default experiment');
  return id;
}

/** "0"に記録する書き手が呼ぶ。最初の書き手が同時に来ても、作るDefaultは1つだけ。 */
export async function createDefaultExperiment(
  connection: Connection,
  projectId: string,
): Promise<void> {
  await connection.query(
    'INSERT INTO experiments(project_id,name) VALUES($1,$2) ON CONFLICT(project_id,name) DO NOTHING',
    [projectId, DEFAULT_EXPERIMENT_NAME],
  );
}

/**
 * 検索に使う実験のid。"0"は解決する。まだ無いDefaultにはRunもLogged Modelも無いので除き、
 * 検索はエラーでなく空の結果を返す（新しいProjectで最初のRunより前にmlflow.search_runs()を
 * 呼んだとき）。
 */
export async function searchableExperimentIds(
  connection: Connection,
  request: { projectId: string; ids: Iterable<string> },
): Promise<string[]> {
  const resolved: string[] = [];
  for (const id of new Set(request.ids)) {
    if (id !== DEFAULT_EXPERIMENT_ID) {
      resolved.push(id);
      continue;
    }
    const defaultId = await findDefaultExperimentId(connection, request.projectId);
    if (defaultId) resolved.push(defaultId);
  }
  return resolved;
}
