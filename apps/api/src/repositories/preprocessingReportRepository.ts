import type { PreprocessingReport } from '@mmt/contracts';
import { first, type Connection } from '../db/database.js';

/** レポートが持つ名前をすべて返す。これで品質ゲートは、最新のレポートから消えた値を無視できる。 */
export async function findPreprocessingMetricNames(
  connection: Connection,
  reference: { projectId: string; runId: string },
): Promise<string[]> {
  const stored = await first<{ metricNames: string[] }>(
    connection,
    'SELECT metric_names FROM preprocessing_reports WHERE project_id=$1 AND run_id=$2',
    [reference.projectId, reference.runId],
  );
  return stored?.metricNames ?? [];
}

export async function findPreprocessingReport(
  connection: Connection,
  reference: { projectId: string; runId: string },
): Promise<PreprocessingReport | null> {
  const stored = await first<{
    runId: string;
    projectId: string;
    revision: number;
    summary: Omit<PreprocessingReport, 'runId' | 'projectId' | 'revision' | 'updatedAt'>;
    updatedAt: string;
  }>(connection, 'SELECT * FROM preprocessing_reports WHERE project_id=$1 AND run_id=$2', [
    reference.projectId,
    reference.runId,
  ]);
  return stored
    ? {
        ...stored.summary,
        runId: stored.runId,
        projectId: stored.projectId,
        revision: stored.revision,
        updatedAt: stored.updatedAt,
      }
    : null;
}
