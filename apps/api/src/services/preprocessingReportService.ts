import type { PreprocessingReport } from '@mmt/contracts';
import { preprocessingReportInputSchema } from '@mmt/contracts/schemas';
import type { z } from 'zod';
import type { Principal } from '../auth/principal.js';
import { first, rows, transaction, type Database } from '../db/database.js';
import { DomainError } from '../domain/errors.js';
import { preprocessingMetrics } from '../domain/preprocessingMetrics.js';
import { isTerminalStatus } from '../domain/runTransitions.js';
import { findRun } from '../repositories/registryRepository.js';
import { findPreprocessingReport } from '../repositories/preprocessingReportRepository.js';
import { appendMetrics } from '../repositories/telemetryRepository.js';
import { requireProject } from './accessService.js';

export type PreprocessingReportSave = z.infer<typeof preprocessingReportInputSchema>;

export class PreprocessingReportService {
  constructor(private readonly database: Database) {}

  async get(
    principal: Principal,
    projectId: string,
    runId: string,
  ): Promise<PreprocessingReport | null> {
    await requireProject(this.database, principal, { projectId, role: 'viewer', scope: 'read' });
    await findRun(this.database, { projectId, id: runId });
    return findPreprocessingReport(this.database, { projectId, runId });
  }

  async save(
    principal: Principal,
    projectId: string,
    request: { runId: string; report: PreprocessingReportSave },
  ): Promise<PreprocessingReport> {
    return transaction(this.database, async (connection) => {
      await requireProject(connection, principal, {
        projectId,
        role: 'editor',
        scope: 'runs:write',
      });
      const run = await findRun(connection, { projectId, id: request.runId, lock: true });
      if (run.kind !== 'processing')
        throw new DomainError(
          422,
          '前処理のレポートはprocessing Runに記録してください',
          'preprocessing_run_kind',
        );
      const report = request.report;
      const sameReport = await first<{ runId: string }>(
        connection,
        'SELECT run_id FROM preprocessing_reports WHERE run_id=$1 AND summary=$2::jsonb',
        [run.id, JSON.stringify(report)],
      );
      if (sameReport)
        return (await findPreprocessingReport(connection, { projectId, runId: run.id }))!;
      if (isTerminalStatus(run.status))
        throw new DomainError(409, '終了したRunの前処理レポートは変更できません', 'run_finalized');
      if (report.sampleArtifactIds.length) {
        const samples = await rows<{ id: string }>(
          connection,
          'SELECT id FROM artifacts WHERE project_id=$1 AND run_id=$2 AND id=ANY($3::uuid[]) AND deleted_at IS NULL ORDER BY id FOR KEY SHARE',
          [projectId, run.id, report.sampleArtifactIds],
        );
        if (samples.length !== report.sampleArtifactIds.length)
          throw new DomainError(
            422,
            '確認用サンプルはこのRunの保存済みArtifactを選んでください',
            'preprocessing_samples_invalid',
          );
      }
      const revision = (await first<{ revision: number }>(
        connection,
        `INSERT INTO preprocessing_reports(run_id,project_id,revision,summary,metric_names) VALUES($1,$2,1,$3,$4)
         ON CONFLICT(run_id) DO UPDATE SET summary=EXCLUDED.summary,revision=preprocessing_reports.revision+1,updated_at=now(),
         metric_names=ARRAY(SELECT DISTINCT name FROM unnest(preprocessing_reports.metric_names || EXCLUDED.metric_names) AS name)
         RETURNING revision`,
        [run.id, projectId, JSON.stringify(report), Object.keys(report.metrics)],
      ))!.revision;
      await connection.query('DELETE FROM preprocessing_report_samples WHERE run_id=$1', [run.id]);
      await connection.query(
        `INSERT INTO preprocessing_report_samples(run_id,project_id,artifact_id)
        SELECT $1,$2,id FROM unnest($3::uuid[]) AS id`,
        [run.id, projectId, report.sampleArtifactIds],
      );
      const timestamp = new Date().toISOString();
      await appendMetrics(
        connection,
        run.id,
        Object.entries(preprocessingMetrics(report)).map(([name, value]) => ({
          name,
          value,
          step: revision,
          timestamp,
        })),
      );
      return (await findPreprocessingReport(connection, { projectId, runId: run.id }))!;
    });
  }
}
