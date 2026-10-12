import { useId } from 'react';
import { Link } from 'react-router-dom';
import type {
  EvaluationComparison,
  EvaluationComparisonStatus,
  MetricComparison,
  MetricValueSource,
  Model,
  ModelAutomationRule,
  ModelVersion,
} from '@mmt/contracts';
import type { useEvaluationComparison } from '../hooks/useEvaluationComparison';
import type { EvaluationBaseline } from '../hooks/useEvaluationBaseline';
import { decodeBaselineChoice, encodeBaselineChoice } from '../lib/evaluationBaseline';
import { isSystemMetricKey } from '../lib/systemMetricKeys';
import {
  defaultBaselineAlias,
  formatDelta,
  formatMetricValue,
  formatRelativeDelta,
} from '../lib/evaluationComparisonDisplay';
import { ResponsiveTable } from './ResponsiveTable';
import { Resource } from './Feedback';
import { DetailsList } from './JsonDetails';
import { RunNameLink } from './RunNameLink';
import { CodeVersionNameLink } from './CodeVersionNameLink';
import { DatasetVersionNameLinks } from './DatasetVersionNameLinks';
import { useLocale } from '../i18n/useLocale';
import { text } from '../i18n/catalog';
import { evaluationTextTemplates } from '../i18n/evaluation';

const statusMessages: Record<Exclude<EvaluationComparisonStatus, 'ok'>, string> = {
  get baseline_missing() { return text.comparisonBaselineMissing; },
  get baseline_not_evaluated() { return text.comparisonBaselineNotEvaluated; },
  get candidate_not_evaluated() { return text.comparisonCandidateNotEvaluated; },
};

const sourceLabels: Record<MetricValueSource, string> = {
  get dataset_context() { return text.metricSourceDatasetContext; },
  get run_latest() { return text.metricSourceRunLatest; },
};

function OptionalRunLink({ projectId, runId }: { projectId: string; runId: string | null }) {
  useLocale();
  return runId ? <RunNameLink projectId={projectId} runId={runId} /> : <>—</>;
}

function ComparisonConditions({
  projectId,
  comparison,
  versionLabel,
  rules,
}: {
  projectId: string;
  comparison: EvaluationComparison;
  versionLabel: (versionId: string) => string;
  rules: readonly ModelAutomationRule[];
}) {
  useLocale();
  const rule = rules.find((item) => item.id === comparison.evaluationRuleId);
  return (
    <DetailsList
      entries={[
        [
          text.baselineVersion,
          comparison.baselineVersionId ? (
            <Link
              className="mono"
              to={`/projects/${projectId}/models?version=${comparison.baselineVersionId}`}
            >
              {versionLabel(comparison.baselineVersionId)}
            </Link>
          ) : (
            '—'
          ),
        ],
        [
          text.referenceDatasets,
          comparison.referenceDatasetVersionIds.length ? (
            <DatasetVersionNameLinks
              projectId={projectId}
              versionIds={comparison.referenceDatasetVersionIds}
            />
          ) : (
            text.noReferenceDatasets
          ),
        ],
        [
          text.evaluationCodeVersion,
          comparison.codeVersionId ? (
            <CodeVersionNameLink projectId={projectId} codeVersionId={comparison.codeVersionId} />
          ) : (
            '—'
          ),
        ],
        // A rule removed since keeps its id: the name cannot be looked up any more.
        [text.evaluationRule, rule?.name ?? comparison.evaluationRuleId ?? text.none],
        [
          text.candidateEvaluationRun,
          <OptionalRunLink projectId={projectId} runId={comparison.candidateRunId} />,
        ],
        [
          text.baselineEvaluationRun,
          <OptionalRunLink projectId={projectId} runId={comparison.baselineRunId} />,
        ],
      ]}
    />
  );
}

const metricValueLabels = { get notFinite() { return text.metricNotFinite; } };

function describeSources(source: MetricComparison['source']): string {
  const labels = [source.candidate, source.baseline].map((value) =>
    value ? sourceLabels[value] : '—',
  );
  return labels[0] === labels[1] ? labels[0]! : `${labels[0]} / ${labels[1]}`;
}

// Differences are shown without good/bad colouring: whether higher is better is defined by
// promotion policies, not by this panel.
function MetricComparisonTable({ metrics }: { metrics: MetricComparison[] }) {
  useLocale();
  return (
    <ResponsiveTable
      rows={metrics}
      rowKey={(metric) => metric.key}
      empty={text.noComparedMetrics}
      columns={[
        // Long metric names wrap, so a phone still shows the delta and the row's toggle.
        {
          key: 'name',
          priority: 'primary',
          header: text.metricName,
          className: 'break-word',
          render: (metric) => metric.key,
        },
        {
          key: 'candidate',
          priority: 'primary',
          header: text.metricCandidate,
          className: 'mono',
          render: (metric) =>
            formatMetricValue(metric.candidate, metric.candidateStatus, metricValueLabels),
        },
        {
          key: 'baseline',
          priority: 'secondary',
          header: text.metricBaseline,
          className: 'mono',
          render: (metric) =>
            formatMetricValue(metric.baseline, metric.baselineStatus, metricValueLabels),
        },
        {
          key: 'delta',
          priority: 'primary',
          header: text.metricDelta,
          className: 'mono',
          render: (metric) => formatDelta(metric.delta),
        },
        {
          key: 'relative-delta',
          priority: 'secondary',
          header: text.metricRelativeDelta,
          className: 'mono',
          render: (metric) => formatRelativeDelta(metric.relativeDelta),
        },
        { key: 'source', priority: 'secondary', header: text.metricSource, render: (metric) => describeSources(metric.source) },
      ]}
    />
  );
}

/**
 * Compares a model version's latest evaluation with the evaluation of a baseline version, chosen
 * by an alias or directly, under the same reference set and evaluation code. Placed on a page by
 * its owner, which also owns the baseline choice so that the metric summary uses the same one.
 */
export function EvaluationComparisonPanel({
  projectId,
  model,
  candidateVersionId,
  versions,
  versionLabel,
  baseline,
  evaluationComparison,
  rules,
}: {
  projectId: string;
  model: Pick<Model, 'aliases'>;
  candidateVersionId: string;
  versions: readonly ModelVersion[];
  versionLabel: (versionId: string) => string;
  baseline: EvaluationBaseline;
  // From useEvaluationComparison on the page, so that the page's reload refreshes it.
  evaluationComparison: ReturnType<typeof useEvaluationComparison>;
  /** Names the evaluation rule of the comparison. */
  rules: readonly ModelAutomationRule[];
}) {
  useLocale();
  const { comparison } = evaluationComparison;
  const selectId = useId();
  const aliasNames = Object.keys(model.aliases).sort();
  const otherVersions = versions.filter((version) => version.id !== candidateVersionId);
  const defaultAlias = defaultBaselineAlias(model.aliases);
  const fellBackFromAlias =
    baseline.isDefault &&
    baseline.choice?.kind === 'version' &&
    defaultAlias !== null &&
    model.aliases[defaultAlias] === candidateVersionId;
  return (
    <section className="automation-panel" aria-label={text.evaluationComparison}>
      <div className="section-heading">
        <h2>{text.evaluationComparison}</h2>
      </div>
      <div className="field">
        <label htmlFor={selectId}>{text.baselineChoice}</label>
        <select
          id={selectId}
          value={encodeBaselineChoice(baseline.choice)}
          disabled={!aliasNames.length && !otherVersions.length}
          onChange={(event) => baseline.select(decodeBaselineChoice(event.target.value))}
        >
          {!baseline.choice && <option value="">{text.noModelAliases}</option>}
          {aliasNames.length > 0 && (
            <optgroup label={text.baselineChoiceAliasGroup}>
              {aliasNames.map((alias) => (
                <option key={alias} value={encodeBaselineChoice({ kind: 'alias', alias })}>
                  {evaluationTextTemplates.baselineAliasOption(
                    alias,
                    versionLabel(model.aliases[alias]!),
                  )}
                </option>
              ))}
            </optgroup>
          )}
          {otherVersions.length > 0 && (
            <optgroup label={text.baselineChoiceVersionGroup}>
              {otherVersions.map((version) => (
                <option
                  key={version.id}
                  value={encodeBaselineChoice({ kind: 'version', versionId: version.id })}
                >
                  {versionLabel(version.id)}
                </option>
              ))}
            </optgroup>
          )}
        </select>
      </div>
      {fellBackFromAlias && defaultAlias && (
        <p className="muted">{evaluationTextTemplates.baselineFallbackHint(defaultAlias)}</p>
      )}
      {baseline.versionId === candidateVersionId && (
        <div className="notice" role="status">
          <span>{text.baselineIsCandidate}</span>
        </div>
      )}
      <Resource query={comparison}>
        {(value) => (
          <>
            {value.status !== 'ok' && (
              <div className="notice" role="status">
                <span>{statusMessages[value.status]}</span>
              </div>
            )}
            <h3>{text.comparisonConditions}</h3>
            <ComparisonConditions
              projectId={projectId}
              comparison={value}
              versionLabel={versionLabel}
              rules={rules}
            />
            <MetricComparisonTable
              metrics={value.metrics.filter((metric) => !isSystemMetricKey(metric.key))}
            />
          </>
        )}
      </Resource>
    </section>
  );
}
