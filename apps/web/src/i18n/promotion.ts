import * as english from './en/promotion';
import { localized } from './localized';
import type {
  ModelAliasProtectionRole,
  PromotionCriterionDirection,
  PromotionCriterionMode,
  PromotionCriterionReason,
  PromotionDecision,
  PromotionMissingBaseline,
} from '@mmt/contracts';
import type { CriterionThresholdMeaning } from '../lib/promotionPolicyInput';
import type { KnownAliasSource } from '../lib/aliasChoices';

// 昇格policy（候補のバージョンの合否の基準）と、その判定の履歴。評価の比較と共通の文言は
// i18n/evaluation.tsのものを使う（baselineAlias、evaluationRule、referenceDatasets、
// evaluationCodeVersion、baselineVersion）。
export const promotionText = localized({
  promotionPolicies: '昇格ポリシー',
  newPromotionPolicy: '昇格ポリシーを作成',
  promotionPoliciesEmpty: '昇格ポリシーはまだありません',
  promotionModel: '対象モデル',
  promotionTargetAlias: '対象Alias',
  promotionEvaluationRuleHint:
    '対象モデルの系列を扱える、有効な評価（Evaluation）の自動実行ルールから選びます。判定には、このルールが作った評価Runだけを使います。',
  promotionEvaluationRulesEmpty:
    'このモデルを対象にできる有効な評価ルールがありません。先に「自動実行ルール」で評価ルールを作成してください。',
  promotionEvaluationConditions: '評価条件（評価ルールの設定）',
  promotionCriteria: '合否基準',
  promotionCriteriaHint: 'すべての基準を満たしたときに合格になります。',
  promotionCriterionMetric: 'メトリクス',
  promotionCriterionDirection: '良い方向',
  promotionCriterionMode: '比べる値',
  promotionCriterionThreshold: '閾値',
  promotionRelativeDeltaHint: '相対差は比率で入力します（0.05 = 5%）。',
  // メトリクス名の候補は、評価ルールの評価のRunが記録したものから取る（RuleMetricKeys.source）。
  promotionMetricKeysChooseRule: '評価ルールを選ぶと、評価Runに記録済みの指標名が候補に出ます。',
  promotionMetricKeysFromRule: 'この評価ルールの評価Runに記録された指標名を候補に出しています。',
  promotionMetricKeysFromCodeVersion:
    'この評価ルールの評価Runはまだ無いため、同じ評価コードバージョンのRunに記録された指標名を候補に出しています。',
  promotionMetricKeysNone:
    '評価Runに記録された指標名はまだありません。評価コードが記録する名前をそのまま入力してください。',
  promotionMetricKeysLoadFailed: '記録済みの指標名を読み込めませんでした。指標名はそのまま入力できます。',
  aliasChoicesLoadFailed: '既存のAliasを読み込めませんでした。Alias名はそのまま入力できます。',
  promotionAddCriterion: '基準を追加',
  promotionRemoveCriterion: '基準を削除',
  promotionMissingBaseline: '基準Aliasが未設定のとき',
  promotionAutoPromote: '合格したら対象Aliasを自動で切り替える',
  promotionAutoPromoteColumn: '自動昇格',
  promotionAutoPromoteOn: 'する',
  promotionAutoPromoteOff: 'しない',
  promotionPolicyEnabled: '作成後すぐに有効にする',
  promotionPolicyFixedSettings:
    '作成後は有効・無効のみ変更できます。設定を変える場合は新しいポリシーを作成してください。',
  promotionEvaluations: '判定履歴',
  promotionEvaluationsEmpty: 'このポリシーの判定はまだありません',
  promotionEvaluatedAt: '日時',
  promotionDecision: '判定',
  promotionCandidateVersion: '候補バージョン',
  promotionEvaluationRuns: '評価Run',
  promotionCriterionResults: '基準ごとの結果',
  promotionCriterionPassed: '満たす',
  promotionCriterionFailed: '満たさない',
  promotionCriterionInsufficient: '判定できない',
  promotionFirstRelease: '初回合格（基準なし）',
  promotionReevaluate: '再判定',
  promotionLoadMore: 'さらに読み込む',
  // 作成フォームのブラウザ側での検証。
  promotionPolicyNameRequired: '名前を入力してください。',
  promotionModelRequired: 'このプロジェクトのモデルを選択してください。',
  promotionTargetAliasRequired: '対象Aliasを入力してください。',
  promotionBaselineAliasRequired: '基準Aliasを入力してください。',
  promotionEvaluationRuleRequired: '対象モデルを扱える有効な評価ルールを選択してください。',
  promotionCriteriaRequired: '合否基準を1つ以上追加してください。',
  promotionCriterionMetricRequired: '合否基準のメトリクス名を入力してください。',
  promotionCriterionThresholdInvalid: '合否基準の閾値は有限の数値で入力してください。',
  // policyの所有者（実行するユーザー）と、Service Accountへの移管。
  promotionPolicyOwner: '実行ユーザー',
  promotionTransferOwner: '所有者を移管',
  promotionTransferOwnerTarget: '移管先のService Account',
  promotionTransferOwnerHint:
    '作成者の記録は残ります。移管先は、このプロジェクトの有効なService Account（roleがadmin）から選びます。',
  promotionTransferOwnerNoCandidates:
    '移管できるService Accountがありません。先にプロジェクト設定でroleがadminのService Accountを作成してください。',
  promotionTransferOwnerRequired: '移管先のService Accountを選択してください。',
  // 昇格のダイアログ（理由と根拠を添えてaliasを付ける）。
  promote: '昇格',
  promotionDialogTitle: 'Aliasを設定（昇格）',
  promotionEvidence: '根拠となる判定',
  promotionEvidenceNone: '指定しない',
  promotionEvidenceChoose: '判定を選択',
  promotionEvidenceRequired: 'このAliasを変更するには、このバージョンの合格判定を選択してください。',
  promotionEvidenceEmpty:
    'このバージョンには、このAliasを対象にした合格判定がありません。このAliasを対象にした昇格ポリシーがあれば、その評価ルールがこのバージョンを評価すると判定されます（ポリシーはModelsの［昇格ポリシー］で確認できます）。',
  promotionPoliciesAdminOnly:
    '昇格ポリシーの作成・有効化・所有者の移管は、Project adminと全体管理者が行います。',
  aliasProtectionsAdminOnly: '保護Aliasの追加・解除は、Project adminと全体管理者が行います。',
  promotionEvaluationRulesDisabled:
    'このモデルの系列を対象にした評価ルールはありますが、無効になっています。Modelsの［自動実行ルール］で有効にすると選べます。',
  promotionReasonRequired: '理由を入力してください。',
  promotionReasonRequiredForFailed:
    'このバージョンはこのAliasの昇格判定で不合格です。昇格させる場合は理由を入力してください。',
  promotionReasonRequiredForProtected: '保護Aliasを合格判定なしで変更するには理由を入力してください。',
  promotionAliasRequired: 'Aliasを入力してください。',
  promotionVersionRequired: 'バージョンを選択してください。',
  promotionProtectedAlias: '保護Alias',
  // モデルバージョンの画面の、昇格の判定のカード。
  promotionCheck: '昇格の判定',
  promotionCheckEmpty: 'このモデルには昇格ポリシーがありません。',
  promotionCheckPending: '判定待ち',
  promotionCheckCurrentAlias: '現在このバージョンを指しています',
  promotionCheckPromotedAutomatically: '自動昇格済み',
  promotionCheckBaselineChanged: '判定中に基準Aliasが変わったため、自動昇格しませんでした。',
  promotionCheckPromotionDenied: 'Aliasの変更が拒否されたため、自動昇格しませんでした。',
  // aliasの保護（Modelsの画面のタブ）。
  aliasProtections: 'Aliasの保護',
  aliasProtectionsEmpty: '保護Aliasはありません。',
  aliasProtectionsHint:
    '保護Aliasは、必要なrole以上の利用者だけが変更できます。合格判定を必須にすると、そのバージョンの合格判定を根拠に指定したときだけ変更できます。MLflow互換APIからは変更できません。',
  aliasProtectionAdd: '保護Aliasを追加',
  aliasProtectionEdit: '保護Aliasを編集',
  aliasProtectionRemove: '保護を解除',
  aliasProtectionScope: '対象',
  aliasProtectionScopeProject: 'プロジェクト全体',
  aliasProtectionRequiredRole: '変更に必要なrole',
  aliasProtectionRequirePassedEvaluation: '合格判定を必須にする',
  aliasProtectionRequirePassedEvaluationColumn: '合格判定',
  aliasProtectionRequired: '必須',
  aliasProtectionNotRequired: '不要',
  aliasProtectionUpdatedAt: '更新日時',
  promotionCriterionNotCompared: '比較なし',
  promotionCheckBaselineMoved:
    'この判定のあと、基準Aliasが別のバージョンへ移りました。今の基準バージョンとは比べていないため、根拠には選んでいません。',
} as const, english.promotionText);

export const promotionDecisionLabels: Record<PromotionDecision, string> = localized({
  passed: '合格',
  failed: '不合格',
  insufficient: '判定不能',
  skipped: '判定せず',
}, english.promotionDecisionLabels);

// 基準が値を比べられなかった理由（PromotionCriterionResult.reason）。
export const promotionCriterionReasonLabels: Record<PromotionCriterionReason, string> = localized({
  candidate_metric_missing: '候補に値がありません',
  candidate_metric_not_finite: '候補の値がNaN/∞です',
  baseline_metric_missing: '基準に値がありません',
  baseline_metric_not_finite: '基準の値がNaN/∞です',
  baseline_zero: '基準が0のため相対差を計算できません',
  baseline_missing: '基準バージョンがないため比べていません',
  baseline_not_evaluated: '基準バージョンに評価がありません',
}, english.promotionCriterionReasonLabels);

export const promotionDirectionLabels: Record<PromotionCriterionDirection, string> = localized({
  higher: '大きいほど良い',
  lower: '小さいほど良い',
}, english.promotionDirectionLabels);

export const promotionModeLabels: Record<PromotionCriterionMode, string> = localized({
  absolute: '候補の値',
  delta: '基準との差',
  relative_delta: '基準との相対差',
}, english.promotionModeLabels);

export const promotionMissingBaselineLabels: Record<PromotionMissingBaseline, string> = localized({
  pass: '合格にする（初回の登録）',
  fail: '不合格にする',
}, english.promotionMissingBaselineLabels);

export const criterionThresholdMeaningLabels: Record<CriterionThresholdMeaning, string> = localized({
  improvement_required: '改善が必要',
  no_regression: '悪化しなければよい',
  regression_allowed: 'この幅までの悪化を許容',
}, english.criterionThresholdMeaningLabels);

// 候補に出すalias名が既にどこで使われているか（lib/aliasChoices.ts）。
export const knownAliasSourceLabels: Record<KnownAliasSource, string> = localized({
  model: 'モデルで使用中',
  policy: '昇格ポリシー',
  protection: '保護Alias',
}, english.knownAliasSourceLabels);

export const aliasProtectionRoleLabels: Record<ModelAliasProtectionRole, string> = localized({
  editor: 'editor以上',
  admin: 'adminのみ',
}, english.aliasProtectionRoleLabels);

// 変更に必要なroleを、文の中で呼ぶ形（「…にはProject adminの権限が必要です」）。
const aliasProtectionRoleNeeded: Record<ModelAliasProtectionRole, string> = {
  editor: 'editor以上',
  admin: 'Project admin',
};

// 値を埋め込む文言。
export const promotionTextTemplates = localized({
  protectedAliasNotice: (role: ModelAliasProtectionRole, requirePassedEvaluation: boolean) =>
    `このAliasは保護されています（${aliasProtectionRoleLabels[role]}${
      requirePassedEvaluation ? '・合格判定が必須' : ''
    }）。`,
  protectedAliasRoleMissing: (role: ModelAliasProtectionRole) =>
    `このAliasの変更には${aliasProtectionRoleNeeded[role]}の権限が必要です。`,
  protectedAliasLabel: (role: ModelAliasProtectionRole) =>
    `保護Alias（${aliasProtectionRoleLabels[role]}）`,
  aliasRemovalRoleMissing: (role: ModelAliasProtectionRole) =>
    `解除には${aliasProtectionRoleNeeded[role]}の権限が必要です`,
  evidenceOption: (policyName: string, createdAt: string) => `${policyName}（${createdAt}）`,
  transferOwnerConfirm: (policyName: string) =>
    `「${policyName}」の判定と自動昇格を、選んだService Accountの権限で実行するように切り替えます。`,
  removeAliasProtectionConfirm: (alias: string, scope: string) =>
    `${scope}のAlias「${alias}」の保護を解除します。解除後はeditor以上の利用者が理由なしで変更できます。`,
  criteriaTooMany: (max: number) => `合否基準は${max}件までです。`,
  criterionSubject: (metric: string, mode: PromotionCriterionMode) =>
    mode === 'absolute' ? metric : `${metric}の${promotionModeLabels[mode]}`,
  ruleOption: (ruleName: string, codeVersion: string) => `${ruleName}（${codeVersion}）`,
  reevaluationSequence: (sequence: number) => `再判定 ${sequence - 1}回目`,
  baselineMovedDetail: (judgedAgainst: string | null, current: string | null) =>
    `判定時の基準バージョン: ${judgedAgainst ?? 'なし'} / 今の基準バージョン: ${current ?? 'なし'}`,
  metricNotRecorded: (metric: string) =>
    `「${metric}」は評価Runに記録されていません。判定のときに値が無く、不合格になります。`,
  aliasNew: (alias: string) => `「${alias}」はまだ使われていない新しいAliasです。`,
  aliasCaseVariant: (variants: readonly string[]) =>
    `「${variants.join('」「')}」が既にあります。大文字・小文字だけが違っても別のAliasになります。`,
}, english.promotionTextTemplates);
