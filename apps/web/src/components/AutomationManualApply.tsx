import { useState } from 'react';
import type { ModelAutomationRule } from '@mmt/contracts';
import type { ExecutionCatalog } from '../types/executionCatalog';
import { AUTOMATION_EXECUTION_PAGE_MAX, automationApi } from '../api/automation';
import { useQuery } from '../hooks/useQuery';
import { FormFields } from './FormFields';
import { ConfirmDialog } from './ConfirmDialog';
import { ErrorNotice } from './Feedback';
import { buildCatalogOptions, withEmptyOption } from '../lib/catalogOptions';
import { getFieldValue } from '../lib/formValues';
import {
  manualExecutionErrorMessage,
  manualExecutionRequest,
  manualUpstreamRunOptions,
  manualVersionOptions,
} from '../lib/automationManualExecution';
import { LocalizedError } from '../lib/localizedError';
import { useLocale } from '../i18n/useLocale';
import { automationText } from '../i18n/automation';

/** Lets a Project admin run a rule on a version (or upstream Run) registered before the rule. */
export function AutomationManualApply({
  rule,
  projectId,
  registry,
  onApplied,
}: {
  rule: ModelAutomationRule;
  projectId: string;
  registry: ExecutionCatalog;
  onApplied: () => void;
}) {
  useLocale();
  const isChained = rule.trigger === 'upstream_run_finished';
  // Only the upstream rule's executions can offer a Run, so the API is asked for those alone.
  const upstreamRuleId = isChained ? rule.upstreamRuleId : null;
  const upstreamExecutions = useQuery({
    key: upstreamRuleId ? `${projectId}:automation-executions:${upstreamRuleId}:manual-apply` : null,
    load: (signal) =>
      automationApi.executionPage(
        projectId,
        { filter: { ruleId: upstreamRuleId! }, limit: AUTOMATION_EXECUTION_PAGE_MAX },
        signal,
      ),
  });
  const [values, setValues] = useState<Record<string, string>>({ target: '' });
  const [isConfirming, setIsConfirming] = useState(false);
  const [isApplied, setIsApplied] = useState(false);
  const versionOptions = buildCatalogOptions(registry).models;
  const options = isChained
    ? manualUpstreamRunOptions({
        rule,
        executions: upstreamExecutions.value?.items ?? [],
        versionLabel: (id) => versionOptions.find((option) => option.value === id)?.label ?? id,
      })
    : manualVersionOptions(rule, registry);
  const selectedId = getFieldValue(values, 'target');
  const selectedLabel = options.find((option) => option.value === selectedId)?.label ?? selectedId;
  const isLoading = isChained && upstreamExecutions.loading && !upstreamExecutions.value;
  return (
    <section className="automation-manual-apply">
      <h4>{automationText.applyToVersion}</h4>
      <ErrorNotice message={upstreamExecutions.error} retry={upstreamExecutions.reload} />
      {!isLoading && !options.length ? (
        <p className="muted">
          {isChained ? automationText.applyNoUpstreamRuns : automationText.applyNoVersions}
        </p>
      ) : (
        <FormFields
          fields={[
            {
              name: 'target',
              label: isChained ? automationText.applyUpstreamRun : automationText.applyVersion,
              type: 'select',
              options: withEmptyOption(options),
            },
          ]}
          values={values}
          onChange={(next) => {
            setValues({ target: getFieldValue(next, 'target') });
            setIsApplied(false);
          }}
        />
      )}
      <button
        className="button small"
        disabled={!selectedId}
        onClick={() => setIsConfirming(true)}
      >
        {automationText.applyToVersion}
      </button>
      {isApplied && <p className="notice">{automationText.applied}</p>}
      {isConfirming && (
        <ConfirmDialog
          title={automationText.applyToVersion}
          message={automationText.applyConfirmMessage(rule.name, selectedLabel)}
          confirmLabel={automationText.applyConfirm}
          onConfirm={() =>
            automationApi
              .createExecution(projectId, rule.id, manualExecutionRequest(rule, selectedId))
              .catch((failure: unknown) => {
                throw new LocalizedError(() => manualExecutionErrorMessage(failure));
              })
          }
          onConfirmed={() => {
            setIsConfirming(false);
            setIsApplied(true);
            onApplied();
          }}
          onClose={() => setIsConfirming(false)}
        />
      )}
    </section>
  );
}
