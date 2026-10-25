import { useState } from 'react';
import type { ModelVersionDetail, PromotionEvaluation, PromotionPolicy } from '@mmt/contracts';
import type { usePromotionChoices } from '../hooks/usePromotionChoices';
import { currentDecisionsForAlias, hasBaselineMoved } from '../lib/promotionEvidence';
import { PromotionDialog } from '../dialogs/PromotionDialog';
import { CriterionResults, DecisionBadge } from './PromotionEvaluationTable';
import { ErrorNotice, Resource } from './Feedback';
import { useLocale } from '../i18n/useLocale';
import { text } from '../i18n/catalog';
import { promotionTextTemplates } from '../i18n/promotion';

// 合格したが、autoPromoteのpolicyがaliasの変更にしなかったときの注記。
const automaticPromotionNotes: Partial<Record<NonNullable<PromotionEvaluation['reason']>, string>> =
  {
    get baseline_changed() { return text.promotionCheckBaselineChanged; },
    get promotion_denied() { return text.promotionCheckPromotionDenied; },
  };

function latestDecision(
  decisions: PromotionEvaluation[],
  policy: PromotionPolicy,
  versionId: string,
): PromotionEvaluation | undefined {
  return currentDecisionsForAlias(decisions, {
    policies: [policy],
    alias: policy.targetAlias,
    versionId,
  })[0];
}

/**
 * モデルの昇格policyごとの、バージョンの状況。合格、不合格、まだ評価待ちのどれかと、その根拠の基準、
 * その判定を根拠に手で昇格するボタン。EditorとAdminにだけ出し、何が許されるかはAPIが決める。
 * ページが`choices`を持ち、ページの再読み込みでここに出す判定も新しくなるようにする。
 */
export function PromotionCheckCard({
  detail,
  versionLabel,
  choices,
  onPromoted,
}: {
  detail: ModelVersionDetail;
  versionLabel: (versionId: string) => string;
  choices: ReturnType<typeof usePromotionChoices>;
  onPromoted: () => void;
}) {
  useLocale();
  const versionId = detail.version.id;
  const [promoting, setPromoting] = useState<{ alias: string; evaluationId?: string } | null>(null);
  return (
    <section className="model-version-section" aria-label={text.promotionCheck}>
      <h2>{text.promotionCheck}</h2>
      <ErrorNotice message={choices.decisions.error} retry={choices.decisions.reload} />
      <Resource query={choices.policies}>
        {(policies) =>
          policies.length ? (
            <ul className="promotion-check-list">
              {policies.map((policy) => {
                const decision = latestDecision(choices.decisions.value ?? [], policy, versionId);
                const isCurrent = detail.aliases.includes(policy.targetAlias);
                const note = decision?.reason
                  ? automaticPromotionNotes[decision.reason]
                  : undefined;
                const baselineMoved =
                  decision?.decision === 'passed' &&
                  !isCurrent &&
                  hasBaselineMoved(decision, { policy, aliases: detail.model.aliases });
                const currentBaselineId = detail.model.aliases[policy.baselineAlias];
                return (
                  <li key={policy.id} className="promotion-check">
                    <div className="section-heading">
                      <h3>
                        {policy.name} <span className="mono">→ {policy.targetAlias}</span>
                      </h3>
                      {!isCurrent && (
                        <button
                          className="button small primary"
                          onClick={() =>
                            setPromoting({
                              alias: policy.targetAlias,
                              evaluationId:
                                decision?.decision === 'passed' && !baselineMoved
                                  ? decision.id
                                  : undefined,
                            })
                          }
                        >
                          {text.promote}
                        </button>
                      )}
                    </div>
                    {decision ? (
                      <>
                        <DecisionBadge evaluation={decision} />
                        {decision.promoted && (
                          <div className="muted">{text.promotionCheckPromotedAutomatically}</div>
                        )}
                        {note && <div className="muted">{note}</div>}
                        {baselineMoved && (
                          <div className="notice" role="status">
                            <span>
                              {text.promotionCheckBaselineMoved}{' '}
                              {promotionTextTemplates.baselineMovedDetail(
                                decision.baselineVersionId
                                  ? versionLabel(decision.baselineVersionId)
                                  : null,
                                currentBaselineId ? versionLabel(currentBaselineId) : null,
                              )}
                            </span>
                          </div>
                        )}
                        <CriterionResults results={decision.criteriaResults} />
                      </>
                    ) : (
                      <span className="status-badge status-neutral">
                        <span aria-hidden="true">●</span>
                        {text.promotionCheckPending}
                      </span>
                    )}
                    {isCurrent && <div className="muted">{text.promotionCheckCurrentAlias}</div>}
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="muted">{text.promotionCheckEmpty}</p>
          )
        }
      </Resource>
      {promoting && (
        <PromotionDialog
          model={detail.model}
          versions={[detail.version]}
          initial={{ ...promoting, versionId }}
          onClose={() => setPromoting(null)}
          onSaved={() => {
            setPromoting(null);
            choices.reload();
            onPromoted();
          }}
        />
      )}
    </section>
  );
}
