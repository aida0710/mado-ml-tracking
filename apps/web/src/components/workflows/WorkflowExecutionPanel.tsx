import type { WorkflowExecution } from '@mmt/contracts';
import { Link } from 'react-router-dom';
import { ErrorNotice } from '../Feedback';
import { DatasetUsagePanel } from './DatasetUsagePanel';
import { PreprocessingReportSummary } from './PreprocessingReportSummary';
import { WorkflowStatusBadge } from './WorkflowStatusBadge';
import { workflowsText as labels, workflowsTextTemplates } from '../../i18n/workflows';
import { joinLabels } from '../../i18n/textJoining';
import { useLocale } from '../../i18n/useLocale';

export function WorkflowExecutionPanel({ execution }: { execution: WorkflowExecution }) {
  useLocale();
  const base = `/projects/${execution.projectId}`;
  return (
    <section className="workflow-execution">
      <h2>
        {labels.workflowExecution} <WorkflowStatusBadge status={execution.status} />
      </h2>
      <p className="muted mono">
        {joinLabels([execution.id, workflowsTextTemplates.workflowVersionLabel(execution.revision)])}
      </p>
      <ErrorNotice message={execution.error} />
      <ol className="workflow-steps">
        {execution.steps.map((step) => (
          <li key={step.id} className="workflow-step">
            <header>
              <h3>{step.name}</h3>
              <WorkflowStatusBadge status={step.status} />
            </header>
            {step.reused && <p className="muted">{labels.workflowReused}</p>}
            <div className="section-actions">
              {step.runId && (
                <Link className="button small" to={`${base}/runs/${step.runId}?tab=details`}>
                  {labels.workflowOpenRun}
                </Link>
              )}
              {step.jobId && (
                <Link className="button small" to={`${base}/jobs?job=${step.jobId}`}>
                  {labels.workflowOpenJob}
                </Link>
              )}
            </div>
            <ErrorNotice message={step.error} />
            <DatasetUsagePanel projectId={execution.projectId} usage={step.datasetUsage} />
            {step.preprocessingReport && (
              <PreprocessingReportSummary report={step.preprocessingReport} />
            )}
            {(step.outputDatasetVersionIds.length > 0 || step.outputModelVersionIds.length > 0) && (
              <section>
                <h4>{labels.workflowOutputs}</h4>
                <ul>
                  {step.outputDatasetVersionIds.map((id) => (
                    <li key={id}>
                      <Link className="mono" to={`${base}/datasets?version=${id}`}>
                        {id}
                      </Link>
                    </li>
                  ))}
                  {step.outputModelVersionIds.map((id) => (
                    <li key={id}>
                      <Link className="mono" to={`${base}/models?version=${id}`}>
                        {id}
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}
