import type { ModelAutomationExecution, ModelAutomationRule } from '@mmt/contracts';
import type { AutomationSkipReason } from "../../lib/automationSkipReason";
import { formatEnglishCount } from '../formatEnglishCount';
import { formatEnglishQuotedList } from '../formatEnglishQuotedList';
import { text } from './catalog';

export const automationOutcomeLabels: Record<ModelAutomationExecution['status'], string> = {
  pending: "Waiting for training to finish",
  queued: text.automationQueued,
  failed: text.automationFailed,
  skipped: text.automationSkipped,
};

export const automationSkipReasonLabels: Record<AutomationSkipReason, string> = {
  source_run_unsuccessful: "Not launched (training run failed or stopped)",
  source_run_timeout: "Not launched (training completion deadline exceeded)",
  upstream_unsuccessful: "Not launched (upstream run failed or stopped)",
  upstream_outputs_missing: "Not launched (upstream run has no output dataset)",
};

export const automationTriggerLabels: Record<ModelAutomationRule['trigger'], string> = {
  model_registered: "Model registration",
  upstream_run_finished: "Upstream rule success",
};

export const automationText = {
  sourceRun: "Open training run",
  triggerRun: "Open upstream run",
  pendingHint: "When the training run succeeds, rules enabled at that time will launch.",
  trigger: "Trigger",
  upstreamRule: "Upstream rule",
  stage: "Stage",
  stageLabel: (stage: number) => `Stage ${stage}`,
  manual: "Manual",
  attemptLabel: (attempt: number) => `Attempt ${attempt}`,
  triggerError: "Select a trigger.",
  upstreamRequired: "Select an upstream rule.",
  upstreamInvalid: "Select a different enabled rule in the same project as the upstream rule.",
  reservedTag: (key: string) =>
    `Tag “${key}” is reserved. Tags beginning with automation. or mmt. are set by the server.`,
  applyToVersion: "Apply to an existing version",
  applyVersion: "Version to apply to",
  applyUpstreamRun: "Upstream run",
  applyConfirm: "Apply",
  applyConfirmMessage: (ruleName: string, targetLabel: string) =>
    `Apply “${ruleName}” to ${targetLabel} and create a job?`,
  applyNoVersions: "No versions in the target model family.",
  applyNoUpstreamRuns: "No runs created by the upstream rule.",
  applyRunning: "This rule is already running for this version. Wait until it finishes before applying it.",
  applyInvalidRule: "This rule cannot be applied.",
  applied: "Job created. Check its status in automation history.",
  automaticRun: "Automatic",
  maxAttempts: "Maximum attempts (2 or more enables automatic retries on failure)",
  retryOf: (attempt: number) => `Automatic retry after failed attempt ${attempt}`,
  rerun: "Rerun",
  rerunConfirmMessage: (ruleName: string) =>
    `Apply “${ruleName}” again to the same version and create a new job?`,
  rerunDone: "Rerun created.",
  owner: "Owner",
  ownerHuman: (name: string) => `${name} (user)`,
  ownerServiceAccount: (name: string) => `${name} (service account)`,
  ownerHint: "Automation runs with this owner's permissions, and the owner becomes the run's creator.",
  transferConfirmMessage: (ruleName: string, accountName: string) =>
    `Transfer ownership of “${ruleName}” to ${accountName}? Future automation will run with this service account's permissions.`,
  copiedRuleName: (name: string) => `${name} (copy)`,
  copyRule: "Copy as new rule",
  copyRuleTitle: (name: string) => `Create a copy of “${name}”`,
  copyRuleHint:
    "Rules cannot be changed after creation. To fix one, create a new rule that starts from its settings.",
  disableSourceRule: (name: string) => `Disable “${name}” after creating`,
  disableSourceRuleHint:
    "If both stay enabled, both rules create jobs for the same version.",
  // The copy was created; disabling the rule it came from failed afterwards.
  sourceRuleLeftEnabled: (rules: { copyName: string; sourceName: string }) =>
    `“${rules.copyName}” was created, but the original “${rules.sourceName}” could not be disabled. Both are now enabled, so both rules create jobs for the same version. Click “Disable” for “${rules.sourceName}” in the list.`,
  downstreamFollowsSource: (names: readonly string[]) =>
    `${formatEnglishQuotedList(names)} ${names.length === 1 ? 'uses' : 'use'} the original rule as “Upstream rule” and will stop running once it is disabled. Recreate ${names.length === 1 ? 'that rule' : 'those rules'} the same way so the new rule becomes the upstream.`,
  downstreamRules: "Rules that run after this rule",
  noDownstreamRules: "None",
  showRuleHistory: "View this rule's history",
  disabledRuleCannotApply:
    "This rule is disabled. Enable it to apply it to existing versions.",
  enableRule: "Enable",
  runAndJobStatus: "Run and job status",
  runLabel: "Run",
  jobLabel: "Job",
  manageAdminOnly:
    "Only project administrators and global administrators can create, change, or apply automation rules.",
  historyAllRules: "All rules",
  historyAllVersions: "All versions",
  historyLoadMore: "Show more",
  historyShownCount: (count: number) => `Showing ${formatEnglishCount(count, 'execution')}, newest first.`,
  transferNoAccounts:
    "No other service accounts are available for transfer. Create an enabled service account with the Admin role in project settings.",
};
