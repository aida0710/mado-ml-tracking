import { useLocale } from '../i18n/useLocale';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { ModelAutomationExecution, ModelAutomationRule } from '@mmt/contracts';
import type { ExecutionCatalog } from '../types/executionCatalog';
import { ResponsiveTable, type ResponsiveTableColumn } from './ResponsiveTable';
import { StatusBadge } from './StatusBadge';
import { formatModelVersionName } from '../lib/catalogOptions';
import { formatDate, formatDuration } from '../lib/format';
import { modelVersionPath } from '../lib/modelVersionPath';
import { text } from '../i18n/catalog';
import {
  automationOutcomeLabels,
  automationSkipReasonLabels,
  automationText,
} from '../i18n/automation';
import { automationSkipReason } from '../lib/automationSkipReason';
import { groupAutomationPipelines, type AutomationPipelineRow } from '../lib/automationPipelines';
import { canRerunExecution } from '../lib/automationRerun';
import { AutomationRerunButton } from './AutomationRerunButton';

function outcomeLabel(execution: ModelAutomationExecution): string {
  const skipReason = automationSkipReason(execution);
  return skipReason
    ? automationSkipReasonLabels[skipReason]
    : automationOutcomeLabels[execution.status];
}

/** The outcome, with the reason a rule failed under it, so no separate error column is needed. */
function OutcomeCell({ execution }: { execution: ModelAutomationExecution }) {
  useLocale();
  return (
    <span className="automation-outcome">
      <span title={execution.status === 'pending' ? automationText.pendingHint : undefined}>
        {outcomeLabel(execution)}
      </span>
      {execution.error && (
        <span className="automation-error" title={execution.error}>
          {execution.error}
        </span>
      )}
    </span>
  );
}

/** The started Run's and Job's states in one cell; a column each made the table too wide. */
function RunAndJobStatus({ execution }: { execution: ModelAutomationExecution }) {
  useLocale();
  if (!execution.runStatus && !execution.jobStatus) return <>—</>;
  return (
    <span className="automation-statuses">
      {execution.runStatus && (
        <span>
          {automationText.runLabel} <StatusBadge status={execution.runStatus} />
        </span>
      )}
      {execution.jobStatus && (
        <span>
          {automationText.jobLabel} <StatusBadge status={execution.jobStatus} />
        </span>
      )}
    </span>
  );
}

function RuleCell({
  execution,
  ruleName,
}: {
  execution: ModelAutomationExecution;
  ruleName: string;
}) {
  useLocale();
  return (
    <span>
      {ruleName}
      {execution.source === 'manual' && (
        <>
          {' '}
          <span className="status-badge status-queued">{automationText.manual}</span>
        </>
      )}
      {execution.attempt > 1 && (
        <span className="muted"> · {automationText.attemptLabel(execution.attempt)}</span>
      )}
      {execution.retryOfExecutionId && (
        <span className="muted"> · {automationText.retryOf(execution.attempt - 1)}</span>
      )}
    </span>
  );
}

function ModelVersionLink({
  projectId,
  modelVersionId,
  catalog,
}: {
  projectId: string;
  modelVersionId: string;
  catalog?: ExecutionCatalog;
}) {
  useLocale();
  const version = catalog?.modelVersions.find((item) => item.id === modelVersionId);
  const modelName = catalog?.models.find((model) => model.id === version?.modelId)?.name;
  // The version page needs the Model id; without the catalog the registry resolves the version.
  if (!version || !modelName)
    return <Link to={`/projects/${projectId}/models?version=${modelVersionId}`}>{modelVersionId}</Link>;
  const label = formatModelVersionName(modelName, version.version);
  // A long model name is cut after a few lines so one row does not fill a phone screen.
  return (
    <Link
      title={label}
      to={modelVersionPath(projectId, { modelId: version.modelId, versionId: version.id })}
    >
      <span className="automation-version">{label}</span>
    </Link>
  );
}

/**
 * Automation executions grouped by pipeline. The 'project' variant lists every version; the
 * 'version' variant is one version's history, so it drops the version column and adds the rule's
 * kind and the Run's duration. onRerun is given only to Project admins, who may apply a rule again.
 */
export function AutomationExecutionsTable({
  executions,
  rules,
  projectId,
  catalog,
  variant = 'project',
  onRerun,
}: {
  executions: ModelAutomationExecution[];
  rules: ModelAutomationRule[];
  projectId: string;
  catalog?: ExecutionCatalog;
  variant?: 'project' | 'version';
  onRerun?: () => void;
}) {
  useLocale();
  const base = `/projects/${projectId}`;
  const rows = groupAutomationPipelines(executions, rules);
  const column = (render: (execution: ModelAutomationExecution) => ReactNode) =>
    (row: AutomationPipelineRow) => render(row.execution);
  const ruleOf = (execution: ModelAutomationExecution) =>
    rules.find((rule) => rule.id === execution.ruleId);
  const versionColumns: ResponsiveTableColumn<AutomationPipelineRow>[] =
    variant === 'version'
      ? [
          {
            key: 'kind',
            priority: 'secondary',
            header: text.kind,
            render: column((execution) => {
              const rule = ruleOf(execution);
              return rule ? text[rule.kind] : '—';
            }),
          },
        ]
      : [
          {
            key: 'model',
            // Kept in a phone's row too: rows of different versions otherwise look the same.
            priority: 'primary',
            // Each cell names the model, so the header needs only the shorter word.
            header: text.version,
            render: column((execution) => (
              <ModelVersionLink
                projectId={projectId}
                modelVersionId={execution.modelVersionId}
                catalog={catalog}
              />
            )),
          },
        ];
  const durationColumns: ResponsiveTableColumn<AutomationPipelineRow>[] =
    variant === 'version'
      ? [
          {
            key: 'duration',
            priority: 'secondary',
            header: text.duration,
            className: 'nowrap',
            render: column((execution) =>
              formatDuration(execution.runStartedAt ?? null, execution.runEndedAt ?? null),
            ),
          },
        ]
      : [];
  const rerunColumns: ResponsiveTableColumn<AutomationPipelineRow>[] = onRerun
    ? [
        {
          key: 'rerun',
          priority: 'secondary',
          header: automationText.rerun,
          render: column((execution) => {
            const rule = ruleOf(execution);
            return rule && canRerunExecution(execution, rule) ? (
              <AutomationRerunButton
                execution={execution}
                rule={rule}
                projectId={projectId}
                onRerun={onRerun}
              />
            ) : null;
          }),
        },
      ]
    : [];
  return (
    <ResponsiveTable
      rows={rows}
      rowKey={(row) => row.execution.id}
      empty={text.automationNoExecutions}
      columns={[
        {
          key: 'stage',
          priority: 'primary',
          header: automationText.stage,
          className: 'nowrap',
          render: (row) =>
            row.isPipelineStart
              ? automationText.stageLabel(row.stage)
              : `└ ${automationText.stageLabel(row.stage)}`,
        },
        {
          key: 'created',
          priority: 'secondary',
          header: text.created,
          render: column((execution) => formatDate(execution.createdAt)),
        },
        {
          key: 'rule',
          priority: 'primary',
          header: text.automationRule,
          render: column((execution) => (
            <RuleCell execution={execution} ruleName={ruleOf(execution)?.name ?? execution.ruleId} />
          )),
        },
        ...versionColumns,
        {
          key: 'outcome',
          priority: 'primary',
          header: text.automationOutcome,
          render: column((execution) => <OutcomeCell execution={execution} />),
        },
        {
          key: 'status',
          priority: 'secondary',
          header: automationText.runAndJobStatus,
          render: column((execution) => <RunAndJobStatus execution={execution} />),
        },
        ...durationColumns,
        {
          key: 'links',
          priority: 'secondary',
          header: text.details,
          render: column((execution) => (
            <div className="automation-links">
              {execution.sourceRunId && (
                <Link to={`${base}/runs/${execution.sourceRunId}`}>{automationText.sourceRun}</Link>
              )}
              {execution.triggerRunId && (
                <Link to={`${base}/runs/${execution.triggerRunId}`}>
                  {automationText.triggerRun}
                </Link>
              )}
              {execution.runId && (
                <Link to={`${base}/runs/${execution.runId}`}>{text.automationRun}</Link>
              )}
              {execution.jobId && (
                <Link to={`${base}/jobs?job=${execution.jobId}`}>{text.automationJob}</Link>
              )}
              {!execution.sourceRunId &&
                !execution.triggerRunId &&
                !execution.runId &&
                !execution.jobId &&
                '—'}
            </div>
          )),
        },
        ...rerunColumns,
      ]}
    />
  );
}
