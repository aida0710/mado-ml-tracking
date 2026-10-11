import type {
  ModelAliasProtectionRole,
  PromotionCriterionDirection,
  PromotionCriterionMode,
  PromotionCriterionReason,
  PromotionDecision,
  PromotionMissingBaseline,
} from '@mmt/contracts';
import type { CriterionThresholdMeaning } from "../../lib/promotionPolicyInput";

// Promotion policies (pass/fail criteria for a candidate version) and their evaluation history.
// Labels shared with the evaluation comparison (baselineAlias, evaluationRule, referenceDatasets,
// evaluationCodeVersion, baselineVersion) come from i18n/evaluation.ts.
export const promotionText = {
  promotionPolicies: "Promotion policy",
  newPromotionPolicy: "Create promotion policy",
  promotionPoliciesEmpty: "No promotion policies yet",
  promotionModel: "Target model",
  promotionTargetAlias: "Target alias",
  promotionEvaluationRuleHint:
    "Select an enabled evaluation automation rule supporting the target model family. Only evaluation runs created by this rule are used for decisions.",
  promotionEvaluationRulesEmpty:
    "No enabled evaluation rule supports this model. Create one in Automation rules first.",
  promotionEvaluationConditions: "Evaluation settings (from the rule)",
  promotionCriteria: "Pass criteria",
  promotionCriteriaHint: "All criteria must pass.",
  promotionCriterionMetric: "Metrics",
  promotionCriterionDirection: "Better direction",
  promotionCriterionMode: "Value to compare",
  promotionCriterionThreshold: "Threshold",
  promotionRelativeDeltaHint: "Enter relative differences as ratios (0.05 = 5%).",
  promotionAddCriterion: "Add criterion",
  promotionRemoveCriterion: "Remove criterion",
  promotionMissingBaseline: "When the baseline alias is not assigned",
  promotionAutoPromote: "Automatically switch the target alias after passing",
  promotionAutoPromoteColumn: "Automatic promotion",
  promotionAutoPromoteOn: "Yes",
  promotionAutoPromoteOff: "No",
  promotionPolicyEnabled: "Enable immediately after creation",
  promotionPolicyFixedSettings:
    "Only enabled/disabled status can be changed after creation. Create a new policy to change its settings.",
  promotionEvaluations: "Decision history",
  promotionEvaluationsEmpty: "No decisions for this policy yet",
  promotionEvaluatedAt: "Date and time",
  promotionDecision: "Decision",
  promotionCandidateVersion: "Candidate version",
  promotionEvaluationRuns: "Evaluation run",
  promotionCriterionResults: "Results by criterion",
  promotionCriterionPassed: "Passed",
  promotionCriterionFailed: "Failed",
  promotionCriterionInsufficient: "Cannot evaluate",
  promotionFirstRelease: "First pass (no baseline)",
  promotionReevaluate: "Re-evaluate",
  promotionLoadMore: "Load more",
  // Client-side validation of the create form.
  promotionPolicyNameRequired: "Enter a name.",
  promotionModelRequired: "Select a model from this project.",
  promotionTargetAliasRequired: "Enter a target alias.",
  promotionBaselineAliasRequired: "Enter a baseline alias.",
  promotionEvaluationRuleRequired: "Select an enabled evaluation rule supporting the target model.",
  promotionCriteriaRequired: "Add at least one pass criterion.",
  promotionCriterionMetricRequired: "Enter a metric name for each pass criterion.",
  promotionCriterionThresholdInvalid: "Thresholds must be finite numbers.",
  // Owner (run-as user) of a policy and its transfer to a Service Account.
  promotionPolicyOwner: "Execution user",
  promotionPolicyOwnerCreator: "Created by",
  promotionPolicyOwnerServiceAccount: "Service account",
  promotionTransferOwner: "Transfer ownership",
  promotionTransferOwnerTarget: "Destination service account",
  promotionTransferOwnerHint:
    "The creator's record is kept. Select an enabled service account with the admin role in this project.",
  promotionTransferOwnerNoCandidates:
    "No service accounts are available for transfer. Create one with the admin role in project settings first.",
  promotionTransferOwnerRequired: "Select a destination service account.",
  // Promotion dialog (assigning an alias with its reason and evidence).
  promote: "Promotion",
  promotionDialogTitle: "Assign alias (promote)",
  promotionEvidence: "Supporting decision",
  promotionEvidenceNone: "Not specified",
  promotionEvidenceChoose: "Select a decision",
  promotionEvidenceRequired: "Select a passing decision for this version to change this alias.",
  promotionEvidenceEmpty: "This version has no passing decision for this alias.",
  promotionReasonRequired: "Enter a reason.",
  promotionReasonRequiredForFailed:
    "This version failed the promotion decision for this alias. Enter a reason to promote it anyway.",
  promotionReasonRequiredForProtected: "Enter a reason to change a protected alias without a passing decision.",
  promotionAliasRequired: "Enter an alias.",
  promotionVersionRequired: "Select a version.",
  promotionProtectedAlias: "Protected aliases",
  // Promotion check card on the model version page.
  promotionCheck: "Promotion decision",
  promotionCheckEmpty: "This model has no promotion policy.",
  promotionCheckPending: "Awaiting decision",
  promotionCheckCurrentAlias: "Currently points to this version",
  promotionCheckPromotedAutomatically: "Automatically promoted",
  promotionCheckBaselineChanged: "Automatic promotion was skipped because the baseline alias changed during evaluation.",
  promotionCheckPromotionDenied: "Automatic promotion was skipped because the alias change was rejected.",
  // Alias protections (Models page tab).
  aliasProtections: "Protected aliases",
  aliasProtectionsEmpty: "No protected aliases.",
  aliasProtectionsHint:
    "Only users with the required role can change protected aliases. When a passing decision is required, the decision for that version must be specified as evidence. These aliases cannot be changed through the MLflow-compatible API.",
  aliasProtectionAdd: "Add protected alias",
  aliasProtectionEdit: "Edit protected alias",
  aliasProtectionRemove: "Remove protection",
  aliasProtectionScope: "Resource",
  aliasProtectionScopeProject: "Project-wide",
  aliasProtectionRequiredRole: "Required role",
  aliasProtectionRequirePassedEvaluation: "Require a passing decision",
  aliasProtectionRequirePassedEvaluationColumn: "Passing decision",
  aliasProtectionRequired: "Required",
  aliasProtectionNotRequired: "Not required",
  aliasProtectionUpdatedAt: "Updated at",
  promotionCriterionNotCompared: "No comparison",
  promotionCheckBaselineMoved:
    "The baseline alias moved to another version after this decision. This decision does not compare against the current baseline and has not been selected as evidence.",
} as const;

export const promotionDecisionLabels: Record<PromotionDecision, string> = {
  passed: "Passed",
  failed: "Failed",
  insufficient: "Cannot evaluate",
  skipped: "Skipped",
};

// Why a criterion could not compare its values (PromotionCriterionResult.reason).
export const promotionCriterionReasonLabels: Record<PromotionCriterionReason, string> = {
  candidate_metric_missing: "Candidate value is missing",
  candidate_metric_not_finite: "Candidate value is NaN or infinite",
  baseline_metric_missing: "Baseline value is missing",
  baseline_metric_not_finite: "Baseline value is NaN or infinite",
  baseline_zero: "Relative difference cannot be calculated because the baseline is zero",
  baseline_missing: "Not compared because no baseline version exists",
  baseline_not_evaluated: "The baseline version has no evaluation",
};

export const promotionDirectionLabels: Record<PromotionCriterionDirection, string> = {
  higher: "Higher is better",
  lower: "Lower is better",
};

export const promotionModeLabels: Record<PromotionCriterionMode, string> = {
  absolute: "Candidate value",
  delta: "Difference from baseline",
  relative_delta: "Relative difference from baseline",
};

export const promotionMissingBaselineLabels: Record<PromotionMissingBaseline, string> = {
  pass: "Pass (first registration)",
  fail: "Fail",
};

export const criterionThresholdMeaningLabels: Record<CriterionThresholdMeaning, string> = {
  improvement_required: "Improvement required",
  no_regression: "No degradation allowed",
  regression_allowed: "Allow degradation up to this amount",
};

export const aliasProtectionRoleLabels: Record<ModelAliasProtectionRole, string> = {
  editor: "Editor or above",
  admin: "Admin only",
};

// Text that embeds values.
export const promotionTextTemplates = {
  protectedAliasNotice: (role: ModelAliasProtectionRole, requirePassedEvaluation: boolean) =>
    `This alias is protected (${aliasProtectionRoleLabels[role]}${requirePassedEvaluation ? "; passing decision required" : ''}).`,
  protectedAliasRoleMissing: (role: ModelAliasProtectionRole) =>
    `Changing this alias requires ${aliasProtectionRoleLabels[role]} permissions.`,
  evidenceOption: (policyName: string, createdAt: string) => `${policyName}（${createdAt}）`,
  transferOwnerConfirm: (policyName: string) =>
    `Switch “${policyName}”'s decisions and automatic promotions to use the selected service account's permissions?`,
  removeAliasProtectionConfirm: (alias: string, scope: string) =>
    `Remove protection from ${scope}'s alias “${alias}”? Editors and above can then change it without a reason.`,
  criteriaTooMany: (max: number) => `At most ${max} pass criteria are allowed.`,
  criterionSubject: (metric: string, mode: PromotionCriterionMode) =>
    mode === 'absolute' ? metric : `${promotionModeLabels[mode]} of ${metric}`,
  ruleOption: (ruleName: string, codeVersion: string) => `${ruleName}（${codeVersion}）`,
  reevaluationSequence: (sequence: number) => `Re-evaluation ${sequence - 1}`,
  baselineMovedDetail: (judgedAgainst: string | null, current: string | null) =>
    `Baseline at decision: ${judgedAgainst ?? "None"} / Current baseline: ${current ?? "None"}`,
};
