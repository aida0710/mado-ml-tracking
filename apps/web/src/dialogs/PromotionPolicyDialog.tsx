import type {
  Model,
  ModelAutomationRule,
  PromotionMissingBaseline,
  PromotionPolicy,
} from '@mmt/contracts';
import type { ExecutionCatalog } from '../types/executionCatalog';
import { useAliasSuggestions } from '../hooks/useAliasSuggestions';
import { usePromotionPolicyForm } from '../hooks/usePromotionPolicyForm';
import { useRuleMetricKeys } from '../hooks/useRuleMetricKeys';
import { useProject } from '../hooks/useProject';
import { Dialog } from '../components/Dialog';
import { ErrorNotice } from '../components/Feedback';
import { DetailsList } from '../components/JsonDetails';
import { LabeledField } from '../components/LabeledField';
import { PromotionCriteriaFields } from '../components/PromotionCriteriaFields';
import { SuggestionInput } from '../components/SuggestionInput';
import { buildCatalogOptions, withEmptyOption } from '../lib/catalogOptions';
import { describeMetricKeySource, suggestMetricKeys } from '../lib/metricKeyChoices';
import {
  PROMOTION_MISSING_BASELINE_CHOICES,
  isEvaluationRuleEligible,
  missingEvaluationRuleReason,
} from '../lib/promotionPolicyInput';
import { useLocale } from '../i18n/useLocale';
import { promotionMissingBaselineLabels, promotionTextTemplates } from '../i18n/promotion';
import { text } from '../i18n/catalog';

// The rule's fixed inputs and code version are the evaluation conditions; they are shown, not edited.
function EvaluationConditions({
  rule,
  catalog,
}: {
  rule: ModelAutomationRule;
  catalog: ExecutionCatalog;
}) {
  useLocale();
  const options = buildCatalogOptions(catalog);
  const labelOf = (items: { value: string; label: string }[], id: string) =>
    items.find((item) => item.value === id)?.label ?? id;
  return (
    <>
      <h3>{text.promotionEvaluationConditions}</h3>
      <DetailsList
        entries={[
          [
            text.referenceDatasets,
            rule.inputDatasetVersionIds.length
              ? rule.inputDatasetVersionIds.map((id) => (
                  <div className="mono" key={id}>
                    {labelOf(options.datasets, id)}
                  </div>
                ))
              : text.noReferenceDatasets,
          ],
          [
            text.evaluationCodeVersion,
            <span className="mono">{labelOf(options.codes, rule.codeVersionId)}</span>,
          ],
        ]}
      />
    </>
  );
}

export function PromotionPolicyDialog({
  models,
  rules,
  catalog,
  initialModelId,
  onClose,
  onSaved,
}: {
  models: Model[];
  rules: ModelAutomationRule[];
  catalog: ExecutionCatalog;
  initialModelId: string;
  onClose: () => void;
  onSaved: (policy: PromotionPolicy) => void;
}) {
  useLocale();
  const { project } = useProject();
  const form = usePromotionPolicyForm({ projectId: project.id, models, rules, initialModelId });
  const { draft } = form;
  const model = models.find((item) => item.id === draft.modelId);
  const eligibleRules = model ? rules.filter((rule) => isEvaluationRuleEligible(rule, model)) : [];
  const selectedRule = eligibleRules.find((rule) => rule.id === draft.evaluationRuleId);
  const codeOptions = buildCatalogOptions(catalog).codes;
  const aliases = useAliasSuggestions({
    projectId: project.id,
    models,
    modelId: draft.modelId || null,
  });
  const recordedMetrics = useRuleMetricKeys(project.id, selectedRule?.id ?? '');
  const metricSuggestions = {
    suggest: async (value: string) => suggestMetricKeys(value, recordedMetrics.value),
    refreshKey: recordedMetrics.value?.items.join('\n') ?? '',
  };
  const metricHint = !selectedRule
    ? text.promotionMetricKeysChooseRule
    : recordedMetrics.error
      ? text.promotionMetricKeysLoadFailed
      : recordedMetrics.value
        ? describeMetricKeySource(recordedMetrics.value)
        : text.loading;
  return (
    <Dialog title={text.newPromotionPolicy} onClose={onClose} dismissible={!form.pending} size="wide">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void form.save().then((policy) => {
            if (policy) onSaved(policy);
          });
        }}
      >
        <fieldset disabled={form.pending}>
          <LabeledField label={text.name} required>
            {(id) => (
              <input
                id={id}
                value={draft.name}
                required
                onChange={(event) => form.changeDraft({ name: event.target.value })}
              />
            )}
          </LabeledField>
          <LabeledField label={text.promotionModel} required>
            {(id) => (
              <select
                id={id}
                value={draft.modelId}
                required
                onChange={(event) => form.changeDraft({ modelId: event.target.value })}
              >
                {withEmptyOption(
                  models.map((item) => ({
                    value: item.id,
                    label: `${item.name} · ${item.family}`,
                  })),
                ).map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            )}
          </LabeledField>
          <LabeledField label={text.promotionTargetAlias} required>
            {(id) => (
              <SuggestionInput
                id={id}
                value={draft.targetAlias}
                required
                suggest={aliases.suggest}
                offerWhenEmpty
                refreshKey={aliases.refreshKey}
                onChange={(targetAlias) => form.changeDraft({ targetAlias })}
              />
            )}
          </LabeledField>
          <LabeledField label={text.baselineAlias} required>
            {(id) => (
              <SuggestionInput
                id={id}
                value={draft.baselineAlias}
                required
                suggest={aliases.suggest}
                offerWhenEmpty
                refreshKey={aliases.refreshKey}
                onChange={(baselineAlias) => form.changeDraft({ baselineAlias })}
              />
            )}
          </LabeledField>
          {aliases.error && (
            <p className="field-hint" role="status">
              {text.aliasChoicesLoadFailed}
            </p>
          )}
          <LabeledField label={text.evaluationRule} required>
            {(id) => (
              <select
                id={id}
                value={draft.evaluationRuleId}
                required
                onChange={(event) => form.changeDraft({ evaluationRuleId: event.target.value })}
              >
                {withEmptyOption(
                  eligibleRules.map((rule) => ({
                    value: rule.id,
                    label: promotionTextTemplates.ruleOption(
                      rule.name,
                      codeOptions.find((option) => option.value === rule.codeVersionId)?.label ??
                        rule.codeVersionId,
                    ),
                  })),
                ).map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            )}
          </LabeledField>
          <p className="muted">
            {!model || eligibleRules.length
              ? text.promotionEvaluationRuleHint
              : missingEvaluationRuleReason(rules, model) === 'disabled'
                ? text.promotionEvaluationRulesDisabled
                : text.promotionEvaluationRulesEmpty}
          </p>
          {selectedRule && <EvaluationConditions rule={selectedRule} catalog={catalog} />}
          <PromotionCriteriaFields
            criteria={draft.criteria}
            metricSuggestions={metricSuggestions}
            metricHint={metricHint}
            onChange={form.changeCriterion}
            onAdd={form.addCriterion}
            onRemove={form.removeCriterion}
          />
          <LabeledField label={text.promotionMissingBaseline}>
            {(id) => (
              <select
                id={id}
                value={draft.missingBaseline}
                onChange={(event) =>
                  form.changeDraft({
                    missingBaseline: event.target.value as PromotionMissingBaseline,
                  })
                }
              >
                {PROMOTION_MISSING_BASELINE_CHOICES.map((choice) => (
                  <option key={choice} value={choice}>
                    {promotionMissingBaselineLabels[choice]}
                  </option>
                ))}
              </select>
            )}
          </LabeledField>
          <label className="checkbox-field">
            <input
              type="checkbox"
              checked={draft.autoPromote}
              onChange={(event) => form.changeDraft({ autoPromote: event.target.checked })}
            />
            {text.promotionAutoPromote}
          </label>
          <label className="checkbox-field">
            <input
              type="checkbox"
              checked={draft.enabled}
              onChange={(event) => form.changeDraft({ enabled: event.target.checked })}
            />
            {text.promotionPolicyEnabled}
          </label>
          <p className="muted">{text.promotionPolicyFixedSettings}</p>
        </fieldset>
        <ErrorNotice message={form.error} />
        <footer>
          <button type="button" className="button" disabled={form.pending} onClick={onClose}>
            {text.cancel}
          </button>
          <button className="button primary" disabled={form.pending}>
            {form.pending ? text.loading : text.create}
          </button>
        </footer>
      </form>
    </Dialog>
  );
}
