import { useLocale } from '../i18n/useLocale';
import type { Model, ModelAutomationRule, PromotionPolicy } from '@mmt/contracts';
import { ResponsiveTable } from './ResponsiveTable';
import { summarizeCriterion } from '../lib/promotionPolicyInput';
import { automationOwnerLabel } from '../lib/automationOwner';
import { text } from '../i18n/catalog';

export function PromotionPolicyTable({
  policies,
  models,
  rules,
  selectedPolicyId,
  canManage,
  pending,
  onSelect,
  onSetEnabled,
  onTransferOwner,
}: {
  policies: PromotionPolicy[];
  models: Model[];
  rules: ModelAutomationRule[];
  selectedPolicyId: string;
  canManage: boolean;
  pending: boolean;
  onSelect: (id: string) => void;
  onSetEnabled: (id: string, enabled: boolean) => void;
  onTransferOwner: (policy: PromotionPolicy) => void;
}) {
  useLocale();
  return (
    <ResponsiveTable
      rows={policies}
      rowKey={(policy) => policy.id}
      selectedKey={selectedPolicyId}
      empty={text.promotionPoliciesEmpty}
      columns={[
        {
          key: 'name',
          priority: 'primary',
          header: text.name,
          render: (policy) => (
            <button className="link-button" onClick={() => onSelect(policy.id)}>
              {policy.name}
            </button>
          ),
        },
        {
          key: 'enabled',
          priority: 'primary',
          header: text.status,
          render: (policy) => (
            <span className={policy.enabled ? 'automation-enabled' : 'muted'}>
              {policy.enabled ? text.enabled : text.disabled}
            </span>
          ),
        },
        {
          key: 'model',
          priority: 'secondary',
          header: text.promotionModel,
          render: (policy) =>
            models.find((model) => model.id === policy.modelId)?.name ?? policy.modelId,
        },
        {
          key: 'targetAlias',
          priority: 'secondary',
          header: text.promotionTargetAlias,
          className: 'mono',
          render: (policy) => policy.targetAlias,
        },
        {
          key: 'baselineAlias',
          priority: 'secondary',
          header: text.baselineAlias,
          className: 'mono',
          render: (policy) => policy.baselineAlias,
        },
        {
          key: 'evaluationRule',
          priority: 'secondary',
          header: text.evaluationRule,
          render: (policy) =>
            rules.find((rule) => rule.id === policy.evaluationRuleId)?.name ??
            policy.evaluationRuleId,
        },
        {
          key: 'criteria',
          // Long metric names would push the actions past the right edge; read in the opened row.
          priority: 'detail',
          header: text.promotionCriteria,
          render: (policy) => (
            <ul className="promotion-criterion-results">
              {policy.criteria.map((criterion, index) => (
                <li key={`${criterion.metric}-${index}`} className="mono">
                  {summarizeCriterion(criterion)}
                </li>
              ))}
            </ul>
          ),
        },
        {
          key: 'autoPromote',
          priority: 'secondary',
          header: text.promotionAutoPromoteColumn,
          render: (policy) =>
            policy.autoPromote ? text.promotionAutoPromoteOn : text.promotionAutoPromoteOff,
        },
        {
          key: 'owner',
          priority: 'secondary',
          header: text.promotionPolicyOwner,
          // The run-as user, by name: a person until moved to a Service Account.
          render: (policy) => automationOwnerLabel(policy),
        },
        ...(canManage
          ? [
              {
                key: 'actions',
                priority: 'secondary' as const,
                header: text.actions,
                render: (policy: PromotionPolicy) => (
                  <div className="access-actions">
                    <button
                      className="button small"
                      disabled={pending}
                      aria-label={`${policy.name}: ${policy.enabled ? text.automationDisable : text.automationEnable}`}
                      onClick={() => onSetEnabled(policy.id, !policy.enabled)}
                    >
                      {policy.enabled ? text.automationDisable : text.automationEnable}
                    </button>
                    <button
                      className="button small"
                      aria-label={`${policy.name}: ${text.promotionTransferOwner}`}
                      onClick={() => onTransferOwner(policy)}
                    >
                      {text.promotionTransferOwner}
                    </button>
                  </div>
                ),
              },
            ]
          : []),
      ]}
    />
  );
}
