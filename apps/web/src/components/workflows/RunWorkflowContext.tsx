import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { Run } from '@mmt/contracts';
import { datasetUsageApi } from '../../api/datasetUsage';
import { preprocessingReportsApi } from '../../api/preprocessingReports';
import { EXECUTION_POLL_MS, useQuery } from '../../hooks/useQuery';
import { isTerminalRun } from '../../lib/runOutputRegistrationState';
import { workflowExecutionIdOfRun, workflowIdOfRun } from '../../lib/workflowRunTags';
import { workflowPath } from '../../lib/workflowPath';
import { Resource } from '../Feedback';
import { DatasetUsagePanel } from './DatasetUsagePanel';
import { PreprocessingReportSummary } from './PreprocessingReportSummary';
import { PreprocessingReportDialog } from '../../dialogs/PreprocessingReportDialog';
import { workflowsText as labels } from '../../i18n/workflows';
import { useLocale } from '../../i18n/useLocale';

/**
 * ワークフローの中でのRunの位置（その実行へのリンクと、データをどう使ったか）と、データ処理の
 * Runならその前処理レポート。ほかのRunでは何も出さず、Runの画面の詳細のグリッドの並びを
 * 保つ。
 */
export function RunWorkflowContext({ run, canEdit }: { run: Run; canEdit: boolean }) {
  useLocale();
  const workflowId = workflowIdOfRun(run);
  if (!workflowId && run.kind !== 'processing') return null;
  return (
    <section className="workflow-run-context">
      {workflowId && <RunWorkflowLink run={run} workflowId={workflowId} />}
      {run.kind === 'processing' && <RunPreprocessingReport run={run} canEdit={canEdit} />}
    </section>
  );
}

function RunWorkflowLink({ run, workflowId }: { run: Run; workflowId: string }) {
  useLocale();
  const executionId = workflowExecutionIdOfRun(run);
  const usage = useQuery({ key: `run-usage:${run.id}`, load: (signal) =>
    datasetUsageApi.forRun(run.projectId, run.id, signal),
  });
  return (
    <>
      <Link className="button" to={workflowPath(run.projectId, { workflowId, executionId })}>
        {labels.workflowOpen}
      </Link>
      <Resource query={usage}>
        {(items) => <DatasetUsagePanel projectId={run.projectId} usage={items} />}
      </Resource>
    </>
  );
}

function RunPreprocessingReport({ run, canEdit }: { run: Run; canEdit: boolean }) {
  useLocale();
  const [editing, setEditing] = useState(false);
  const report = useQuery({
    key: `preprocessing-report:${run.id}`,
    load: (signal) => preprocessingReportsApi.get(run.projectId, run.id, signal),
    pollMs: isTerminalRun(run) ? undefined : EXECUTION_POLL_MS,
  });
  return (
    <Resource query={report}>
      {(summary) => (
        <>
          {summary ? (
            <PreprocessingReportSummary report={summary} />
          ) : (
            <p className="muted">{labels.preprocessingNoReport}</p>
          )}
          {canEdit && !isTerminalRun(run) && (
            <button className="button" onClick={() => setEditing(true)}>
              {labels.preprocessingReportEdit}
            </button>
          )}
          {editing && (
            <PreprocessingReportDialog
              projectId={run.projectId}
              runId={run.id}
              report={summary}
              onClose={() => setEditing(false)}
              onSaved={() => {
                setEditing(false);
                report.reload();
              }}
            />
          )}
        </>
      )}
    </Resource>
  );
}
