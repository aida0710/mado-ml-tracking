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
 * A Run's place in a workflow (a link to its execution and how it used its data) and, for a
 * processing Run, its preprocessing report. Nothing for any other Run, so the details grid of
 * the Run page keeps its order.
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
  const usage = useQuery(`run-usage:${run.id}`, (signal) =>
    datasetUsageApi.forRun(run.projectId, run.id, signal),
  );
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
  const report = useQuery(
    `preprocessing-report:${run.id}`,
    (signal) => preprocessingReportsApi.get(run.projectId, run.id, signal),
    isTerminalRun(run) ? undefined : EXECUTION_POLL_MS,
  );
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
