import { Link } from 'react-router-dom';
import type { AutomatedRunSummary, ModelAutomationRule } from '@mmt/contracts';
import { ResponsiveTable, type ResponsiveTableColumn } from './ResponsiveTable';
import { StatusBadge } from './StatusBadge';
import { formatDate } from '../lib/format';
import { formatMetricValue } from '../lib/evaluationComparisonDisplay';
import type { EvaluationSummary, MetricSummaryRow, MetricValueAt } from '../lib/evaluationSummary';
import { useLocale } from '../i18n/useLocale';
import { text } from '../i18n/catalog';
import { automationText } from '../i18n/automation';
import { deltaSignLabels, modelsTextTemplates } from '../i18n/models';

const metricValueLabels = { get notFinite() { return text.metricNotFinite; } };

function formatSummaryValue(value: MetricValueAt | null): string {
  return value ? formatMetricValue(value.value, 'present', metricValueLabels) : '—';
}

function formatRunMetric(run: AutomatedRunSummary, metric: string): string {
  const value: unknown = run.latestMetrics[metric];
  if (typeof value !== 'number') return '—';
  return formatMetricValue(value, Number.isFinite(value) ? 'present' : 'not_finite', metricValueLabels);
}

// Automatic evaluations are the ones promotion policies judge, so the mark names the rule.
function OriginBadge({ run, ruleName }: { run: AutomatedRunSummary; ruleName: string | null }) {
  useLocale();
  return run.automatic ? (
    <span className="evaluation-origin evaluation-origin-automatic">
      {ruleName ? modelsTextTemplates.automaticByRule(ruleName) : text.evaluationAutomatic}
    </span>
  ) : (
    <span className="evaluation-origin evaluation-origin-manual">{automationText.manual}</span>
  );
}

function MetricSummaryTable({
  projectId,
  summary,
  baselineLabel,
}: {
  projectId: string;
  summary: EvaluationSummary;
  baselineLabel: string | null;
}) {
  useLocale();
  const runLink = (value: MetricValueAt | null) =>
    value ? (
      <Link className="mono" to={`/projects/${projectId}/runs/${value.runId}`}>
        {formatSummaryValue(value)}
      </Link>
    ) : (
      '—'
    );
  // A phone keeps the latest and the baseline value side by side; the sign opens with the row.
  const baselineColumns: ResponsiveTableColumn<MetricSummaryRow>[] = baselineLabel
    ? [
        {
          key: 'baseline',
          priority: 'primary',
          header: modelsTextTemplates.baselineValue(baselineLabel),
          className: 'mono',
          render: (row) => runLink(row.baseline),
        },
        {
          key: 'sign',
          priority: 'secondary',
          header: text.evaluationDeltaSign,
          render: (row) =>
            row.deltaSign ? (
              <span className={`delta-sign delta-sign-${row.deltaSign}`}>
                {deltaSignLabels[row.deltaSign]}
              </span>
            ) : (
              '—'
            ),
        },
      ]
    : [];
  return (
    <ResponsiveTable
      rows={summary.rows}
      rowKey={(row) => row.metric}
      empty={text.evaluationSummaryEmpty}
      columns={[
        {
          key: 'metric',
          priority: 'primary',
          header: text.metricName,
          className: 'break-word',
          render: (row) => row.metric,
        },
        {
          key: 'latest',
          priority: 'primary',
          header: text.evaluationLatestValue,
          className: 'mono',
          render: (row) => runLink(row.candidate),
        },
        ...baselineColumns,
      ]}
    />
  );
}

/**
 * The version's evaluation Runs in one table, summary metrics first, each marked as an automatic
 * evaluation (with its rule) or a manual one, above the per-metric latest values and the sign of
 * the difference from the baseline version.
 */
export function EvaluationResultsTable({
  projectId,
  runs,
  rules,
  summary,
  baselineLabel,
}: {
  projectId: string;
  runs: AutomatedRunSummary[];
  rules: ModelAutomationRule[];
  summary: EvaluationSummary;
  baselineLabel: string | null;
}) {
  useLocale();
  const ruleName = (run: AutomatedRunSummary) =>
    rules.find((rule) => rule.id === run.ruleId)?.name ?? null;
  const metricColumns: ResponsiveTableColumn<AutomatedRunSummary>[] = summary.metricKeys.map((metric) => ({
    key: `metric:${metric}`,
    priority: 'secondary',
    header: metric,
    className: 'mono',
    render: (run) => formatRunMetric(run, metric),
  }));
  return (
    <>
      <h3>{text.evaluationSummary}</h3>
      <p className="muted">{text.evaluationSummaryHint}</p>
      <MetricSummaryTable projectId={projectId} summary={summary} baselineLabel={baselineLabel} />
      <h3>{text.evaluationRuns}</h3>
      <ResponsiveTable
        rows={runs}
        rowKey={(run) => run.id}
        empty={text.evaluationResultsEmpty}
        columns={[
          {
            key: 'name',
            priority: 'primary',
            header: text.name,
            className: 'evaluation-run-name',
            render: (run) => <Link to={`/projects/${projectId}/runs/${run.id}`}>{run.name}</Link>,
          },
          {
            key: 'origin',
            priority: 'secondary',
            header: text.evaluationRule,
            render: (run) => <OriginBadge run={run} ruleName={ruleName(run)} />,
          },
          {
            key: 'status',
            priority: 'primary',
            header: text.status,
            render: (run) => <StatusBadge status={run.status} />,
          },
          {
            key: 'reference',
            priority: 'secondary',
            header: text.evaluationReferenceSet,
            className: 'mono',
            render: (run) => run.referenceDatasetVersionIds.length || '—',
          },
          {
            key: 'upstream',
            priority: 'secondary',
            header: text.evaluationUpstreamOutputs,
            className: 'mono',
            render: (run) => run.upstreamDatasetVersionIds.length || '—',
          },
          {
            key: 'created',
            priority: 'secondary',
            header: text.created,
            render: (run) => formatDate(run.createdAt),
          },
          ...metricColumns,
        ]}
      />
    </>
  );
}
