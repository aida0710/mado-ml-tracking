import { first, type Connection } from '../db/database.js';
import { notFound } from '../domain/errors.js';

/** The id MLflow clients use for the Default Experiment until set_experiment() is called. */
export const DEFAULT_EXPERIMENT_ID = '0';
export const DEFAULT_EXPERIMENT_NAME = 'Default';

/**
 * The Project's Default Experiment, or null before anything was recorded in it. MLflow always
 * has its Default; here the first Run or Logged Model that names "0" creates it.
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

/** An Experiment id from an MLflow request, with "0" read as the Project's Default. */
export async function resolveExperimentId(
  connection: Connection,
  reference: { projectId: string; id: string },
): Promise<string> {
  if (reference.id !== DEFAULT_EXPERIMENT_ID) return reference.id;
  const id = await findDefaultExperimentId(connection, reference.projectId);
  if (!id) notFound('default experiment');
  return id;
}

/** Called by writers that record into "0"; concurrent first writers create a single Default. */
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
 * Experiment ids for a search, with "0" resolved. A Default that does not exist yet holds no
 * Runs or Logged Models, so it is left out and the search answers with nothing instead of an
 * error (mlflow.search_runs() in a new Project, before its first Run).
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
