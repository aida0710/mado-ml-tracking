import { useState } from 'react';
import type { Model, ModelVersion, PromotionPolicy } from '@mmt/contracts';
import { MAX_MODEL_ALIAS_REASON_LENGTH, registryApi } from '../api/registry';
import { Dialog } from '../components/Dialog';
import { ErrorNotice } from '../components/Feedback';
import { FormFields } from '../components/FormFields';
import { useMutation } from '../hooks/useMutation';
import { useProject } from '../hooks/useProject';
import { usePromotionChoices } from '../hooks/usePromotionChoices';
import { collectKnownAliases, suggestAliasNames } from '../lib/aliasChoices';
import { formatDate } from '../lib/format';
import { getFieldValue, type FormValues } from '../lib/formValues';
import {
  currentDecisionsForAlias,
  effectiveAliasProtection,
  meetsProtectionRole,
  promotionEvidenceRequirement,
} from '../lib/promotionEvidence';
import type { FormField } from '../types/form';
import { useLocale } from '../i18n/useLocale';
import { promotionTextTemplates } from '../i18n/promotion';
import { text } from '../i18n/catalog';

/**
 * aliasを、理由と、あればその根拠になる合格した昇格の判定とともに、バージョンへ向ける。保護された
 * aliasは保護が求めるものを求め、確認に落ちたバージョンを昇格するときは理由を求める。
 */
export function PromotionDialog({
  model,
  versions,
  initial = {},
  onClose,
  onSaved,
}: {
  model: Model;
  versions: ModelVersion[];
  initial?: { alias?: string; versionId?: string; evaluationId?: string };
  onClose: () => void;
  onSaved: () => void;
}) {
  useLocale();
  const { project } = useProject();
  const [values, setValues] = useState<FormValues>({
    alias: initial.alias ?? '',
    version: initial.versionId ?? versions[0]?.id ?? '',
    evaluation: initial.evaluationId ?? '',
    reason: '',
  });
  const [validationError, setValidationError] = useState<string | null>(null);
  const mutation = useMutation();
  const alias = getFieldValue(values, 'alias').trim();
  const versionId = getFieldValue(values, 'version');
  const choices = usePromotionChoices(project.id, model.id, versionId);
  const policies = choices.policies.value ?? [];
  const protection = effectiveAliasProtection(choices.protections.value ?? [], {
    modelId: model.id,
    alias,
  });
  const decisions = currentDecisionsForAlias(choices.decisions.value ?? [], {
    policies,
    alias,
    versionId,
  });
  const passedDecisions = decisions.filter((decision) => decision.decision === 'passed');
  // 別のaliasやバージョンについて選んだ判定は、もう根拠として数えない。
  const selectedEvaluationId = getFieldValue(values, 'evaluation');
  const evaluationId = passedDecisions.some((decision) => decision.id === selectedEvaluationId)
    ? selectedEvaluationId
    : '';
  const requirement = promotionEvidenceRequirement({ protection, decisions, evaluationId });
  const roleMissing = !meetsProtectionRole(project.role, protection);
  const policyName = (policyId: string) =>
    policies.find((policy: PromotionPolicy) => policy.id === policyId)?.name ?? policyId;
  // モデルのaliasと、そのモデルの昇格policyや保護が挙げるalias。`producton`のような打ち間違いを、
  // 作る前に新しいaliasとして見せるため。
  const knownAliases = collectKnownAliases({
    models: [model],
    modelId: model.id,
    policies,
    protections: choices.protections.value ?? [],
  });
  const fields: FormField[] = [
    {
      name: 'alias',
      label: text.alias,
      required: true,
      suggest: async (value) => suggestAliasNames(value, knownAliases),
      offerSuggestionsWhenEmpty: true,
      suggestionsRefreshKey: [...knownAliases.keys()].join('\n'),
    },
    {
      name: 'version',
      label: text.version,
      type: 'select',
      required: true,
      options: versions.map((version) => ({ value: version.id, label: version.version })),
    },
    {
      name: 'evaluation',
      label: text.promotionEvidence,
      type: 'select',
      required: requirement.evaluationRequired,
      options: [
        {
          value: '',
          label: requirement.evaluationRequired
            ? text.promotionEvidenceChoose
            : text.promotionEvidenceNone,
        },
        ...passedDecisions.map((decision) => ({
          value: decision.id,
          label: promotionTextTemplates.evidenceOption(
            policyName(decision.policyId),
            formatDate(decision.createdAt),
          ),
        })),
      ],
      visible: () => passedDecisions.length > 0 || requirement.evaluationRequired,
    },
    {
      name: 'reason',
      label: text.aliasReason,
      type: 'textarea',
      required: requirement.reasonRequired,
      placeholder: text.aliasReasonPlaceholder,
      maxLength: MAX_MODEL_ALIAS_REASON_LENGTH,
    },
  ];
  const reason = getFieldValue(values, 'reason').trim();

  function validationMessage(): string | null {
    if (!alias) return text.promotionAliasRequired;
    if (!versionId) return text.promotionVersionRequired;
    if (requirement.evaluationRequired && !evaluationId) return text.promotionEvidenceRequired;
    if (requirement.reasonRequired && !reason)
      return protection
        ? text.promotionReasonRequiredForProtected
        : text.promotionReasonRequiredForFailed;
    return null;
  }

  return (
    <Dialog title={text.promotionDialogTitle} onClose={onClose} dismissible={!mutation.pending}>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          const message = validationMessage();
          setValidationError(message);
          if (message) return;
          void mutation
            .run(() =>
              registryApi.assignAlias(project.id, model.id, {
                alias,
                versionId,
                reason,
                evaluationId: evaluationId || undefined,
              }),
            )
            .then((saved) => {
              if (saved) onSaved();
            });
        }}
      >
        <fieldset disabled={mutation.pending}>
          <FormFields fields={fields} values={values} onChange={setValues} />
        </fieldset>
        {protection && (
          <p className="notice" role="status">
            {promotionTextTemplates.protectedAliasNotice(
              protection.requiredRole,
              protection.requirePassedEvaluation,
            )}
          </p>
        )}
        {roleMissing && protection && (
          <ErrorNotice
            message={promotionTextTemplates.protectedAliasRoleMissing(protection.requiredRole)}
          />
        )}
        {requirement.evaluationRequired &&
          !passedDecisions.length &&
          !choices.decisions.loading && <p className="notice">{text.promotionEvidenceEmpty}</p>}
        {requirement.reasonRequired && !protection && (
          <p className="notice">{text.promotionReasonRequiredForFailed}</p>
        )}
        <ErrorNotice message={choices.policies.error} retry={choices.reload} />
        <ErrorNotice message={choices.protections.error} retry={choices.reload} />
        <ErrorNotice message={choices.decisions.error} retry={choices.reload} />
        <ErrorNotice message={validationError ?? mutation.error} />
        <footer>
          <button type="button" className="button" onClick={onClose} disabled={mutation.pending}>
            {text.cancel}
          </button>
          <button className="button primary" disabled={mutation.pending || roleMissing}>
            {mutation.pending ? text.loading : text.save}
          </button>
        </footer>
      </form>
    </Dialog>
  );
}
