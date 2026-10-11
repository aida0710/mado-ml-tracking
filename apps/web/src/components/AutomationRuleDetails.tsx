import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { ModelAutomationRule } from '@mmt/contracts';
import type { AutomationCatalog } from '../types/modelAutomation';
import { automationApi } from '../api/automation';
import { DetailsList, JsonDetails } from './JsonDetails';
import { CodeRuntimeDetails } from './CodeRuntimeDetails';
import { AutomationManualApply } from './AutomationManualApply';
import { ServiceAccountOwnerTransfer } from './ServiceAccountOwnerTransfer';
import {
  RULE_OWNER_ROLES,
  automationOwnerLabel,
  serviceAccountOwnerOptions,
} from '../lib/automationOwner';
import { buildCatalogOptions } from '../lib/catalogOptions';
import { downstreamRules } from '../lib/modelAutomationInput';
import { formatDate } from '../lib/format';
import { creatorName } from '../lib/creatorName';
import { text } from '../i18n/catalog';
import { automationText, automationTriggerLabels } from '../i18n/automation';

export function AutomationRuleDetails({
  rule,
  rules,
  catalog,
  projectId,
  canManage,
  pending,
  onSelectRule,
  onEnable,
  onCopy,
  onShowHistory,
  onApplied,
}: {
  rule: ModelAutomationRule;
  rules: ModelAutomationRule[];
  catalog?: AutomationCatalog;
  projectId: string;
  canManage: boolean;
  /** An enable or disable request is in flight. */
  pending: boolean;
  onSelectRule: (id: string) => void;
  onEnable: () => void;
  /** Opens a new rule's form filled with this rule's settings. */
  onCopy: () => void;
  onShowHistory: () => void;
  onApplied: () => void;
}) {
  const options = catalog ? buildCatalogOptions(catalog.registry) : undefined;
  const code = catalog?.registry.codeVersions.find((version) => version.id === rule.codeVersionId);
  const base = `/projects/${projectId}`;
  const upstream = rules.find((item) => item.id === rule.upstreamRuleId);
  const followers = downstreamRules(rules, rule);
  const ruleLink = (item: ModelAutomationRule) => (
    <button key={item.id} className="link-button" onClick={() => onSelectRule(item.id)}>
      {item.name}
    </button>
  );
  return (
    <section className="automation-rule-detail">
      <div className="section-heading">
        <h3>{rule.name}</h3>
        <div>
          <button className="button small" onClick={onShowHistory}>
            {automationText.showRuleHistory}
          </button>
          {canManage && (
            <button className="button small" onClick={onCopy}>
              {automationText.copyRule}
            </button>
          )}
        </div>
      </div>
      <DetailsList
        entries={[
          [automationText.trigger, automationTriggerLabels[rule.trigger]],
          ...(rule.upstreamRuleId
            ? [
                [
                  automationText.upstreamRule,
                  upstream ? ruleLink(upstream) : rule.upstreamRuleId,
                ] satisfies [string, ReactNode],
              ]
            : []),
          [
            automationText.downstreamRules,
            followers.length ? (
              <span className="inline-links">{followers.map(ruleLink)}</span>
            ) : (
              automationText.noDownstreamRules
            ),
          ],
          [text.automationModelFamilies, rule.modelFamilies.join(', ')],
          [text.kind, text[rule.kind]],
          [
            text.experiments,
            <Link to={`${base}/experiments?experiment=${rule.experimentId}`}>
              {options?.experiments.find((option) => option.value === rule.experimentId)?.label ??
                rule.experimentId}
            </Link>,
          ],
          [
            text.codeVersion,
            <Link to={`${base}/codes?version=${rule.codeVersionId}`}>
              {options?.codes.find((option) => option.value === rule.codeVersionId)?.label ??
                rule.codeVersionId}
            </Link>,
          ],
          [
            text.target,
            catalog?.targets.find((target) => target.id === rule.targetId)?.name ?? rule.targetId,
          ],
          [text.gpuIds, rule.gpuIds.join(', ') || text.cpuOnly],
          [
            text.inputDatasets,
            rule.inputDatasetVersionIds.length
              ? rule.inputDatasetVersionIds.map((id) => (
                  <Link className="version-link" key={id} to={`${base}/datasets?version=${id}`}>
                    {options?.datasets.find((option) => option.value === id)?.label ?? id}
                  </Link>
                ))
              : text.none,
          ],
          [text.maxAttempts, rule.maxAttempts],
          [
            automationText.owner,
            <span title={automationText.ownerHint}>{automationOwnerLabel(rule)}</span>,
          ],
          [text.user, <span title={rule.createdBy}>{creatorName(rule)}</span>],
          [text.created, formatDate(rule.createdAt)],
        ]}
      />
      {code && <CodeRuntimeDetails version={code} />}
      {canManage && !rule.enabled && (
        <section className="automation-manual-apply">
          <h4>{automationText.applyToVersion}</h4>
          <p className="muted">{automationText.disabledRuleCannotApply}</p>
          <button className="button small" disabled={pending} onClick={onEnable}>
            {automationText.enableRule}
          </button>
        </section>
      )}
      {canManage && rule.enabled && catalog && (
        <AutomationManualApply
          key={rule.id}
          rule={rule}
          projectId={projectId}
          registry={catalog.registry}
          onApplied={onApplied}
        />
      )}
      {canManage && (
        <ServiceAccountOwnerTransfer
          key={`${rule.id}:owner`}
          projectId={projectId}
          candidates={(accounts) =>
            serviceAccountOwnerOptions(accounts, {
              runAsUserId: rule.runAsUserId,
              roles: RULE_OWNER_ROLES,
            })
          }
          confirmMessage={(accountName) =>
            automationText.transferConfirmMessage(rule.name, accountName)
          }
          noAccountsMessage={automationText.transferNoAccounts}
          transfer={(serviceAccountId) =>
            automationApi.transferOwner(projectId, rule.id, { serviceAccountId })
          }
          onTransferred={onApplied}
        />
      )}
      <details className="automation-settings">
        <summary>
          {text.parameters} / {text.tags}
        </summary>
        <JsonDetails value={rule.parameters} />
        <JsonDetails value={rule.tags} />
        <p className="muted">{text.automationFixedSettings}</p>
      </details>
    </section>
  );
}
