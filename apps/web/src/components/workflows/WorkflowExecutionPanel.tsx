import type { WorkflowExecution } from '@mmt/contracts';
import { Link } from 'react-router-dom';
import { ErrorNotice } from '../Feedback';
import { DatasetUsagePanel } from './DatasetUsagePanel';
import { PreprocessingReportSummary } from './PreprocessingReportSummary';
import { workflowsText as labels } from '../../i18n/workflows';
import { workflowStatusLabel } from '../../lib/workflowLabels';
import { useLocale } from '../../i18n/useLocale';

export function WorkflowExecutionPanel({ execution }: { execution: WorkflowExecution }) {
  useLocale();
  const base = `/projects/${execution.projectId}`;
  return (
    <section className="workflow-execution">
      <h2>
        {labels.workflowExecution} ·{' '}
        <span className={`workflow-status ${execution.status}`}>
          {workflowStatusLabel(execution.status)}
        </span>
      </h2>
      <p className="muted mono">
        {execution.id} · v{execution.revision}
      </p>
      <ErrorNotice message={execution.error} />
      <ol className="workflow-steps">
        {execution.steps.map((step) => (
          <li key={step.id} className={`workflow-step ${step.status}`}>
            <header>
              <h3>{step.name}</h3>
              <span className={`workflow-status ${step.status}`}>
                {workflowStatusLabel(step.status)}
              </span>
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
