import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { Run } from '@mmt/contracts';
import { preprocessingApi } from '../../api/workflows';
import { EXECUTION_POLL_MS, useQuery } from '../../hooks/useQuery';
import { isTerminalRun } from '../../lib/runOutputRegistrationState';
import { Resource } from '../Feedback';
import { DatasetUsagePanel } from './DatasetUsagePanel';
import { PreprocessingReportSummary } from './PreprocessingReportSummary';
import { PreprocessingReportDialog } from '../../dialogs/PreprocessingReportDialog';
import { workflowsText as labels } from '../../i18n/workflows';
import { useLocale } from '../../i18n/useLocale';

export function RunWorkflowContext({ run, canEdit }: { run: Run; canEdit: boolean }) {
  useLocale();
  const [editing, setEditing] = useState(false);
  const workflowId = run.tags['mmt.workflowId'];
  const executionId = run.tags['mmt.workflowExecutionId'];
  const usage = useQuery(workflowId ? `run-usage:${run.id}` : null, (signal) =>
    preprocessingApi.usage(run.projectId, run.id, signal),
  );
  const report = useQuery(
    run.kind === 'processing' ? `preprocessing-report:${run.id}` : null,
    (signal) => preprocessingApi.report(run.projectId, run.id, signal),
    isTerminalRun(run) ? undefined : EXECUTION_POLL_MS,
  );
  return (
    <section className="workflow-run-context">
      {workflowId && (
        <Link
          className="button"
          to={`/projects/${run.projectId}/workflows/${workflowId}?execution=${executionId ?? ''}`}
        >
          {labels.workflowOpen}
        </Link>
      )}
      <Resource query={usage}>
        {(items) => <DatasetUsagePanel projectId={run.projectId} usage={items} />}
      </Resource>
      {run.kind === 'processing' && (
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
      )}
    </section>
  );
}
